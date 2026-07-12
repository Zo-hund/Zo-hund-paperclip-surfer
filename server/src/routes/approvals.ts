import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { rqSubmissions, lmsMarketplaceBookings, lmsMarketplaceListings, opprrcDeliveries } from "@paperclipai/db";
import {
  addApprovalCommentSchema,
  createApprovalSchema,
  escalateApprovalSchema,
  requestApprovalRevisionSchema,
  resolveApprovalSchema,
  resubmitApprovalSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import {
  approvalService,
  heartbeatService,
  issueApprovalService,
  logActivity,
  secretService,
} from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { redactEventPayload } from "../redaction.js";
import { badRequest, notFound, unprocessable } from "../errors.js";
import { amxChainService } from "../services/amxChainService.js";

function redactApprovalPayload<T extends { payload: Record<string, unknown> }>(approval: T): T {
  return {
    ...approval,
    payload: redactEventPayload(approval.payload) ?? {},
  };
}

export function approvalRoutes(db: Db) {
  const router = Router();
  const svc = approvalService(db);
  const heartbeat = heartbeatService(db);
  const issueApprovalsSvc = issueApprovalService(db);
  const secretsSvc = secretService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";

  router.get("/companies/:companyId/approvals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const status = req.query.status as string | undefined;
    const result = await svc.list(companyId, status);
    res.json(result.map((approval) => redactApprovalPayload(approval)));
  });

  router.get("/approvals/:id", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    res.json(redactApprovalPayload(approval));
  });

  router.post("/companies/:companyId/approvals", validate(createApprovalSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rawIssueIds = req.body.issueIds;
    const issueIds = Array.isArray(rawIssueIds)
      ? rawIssueIds.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const uniqueIssueIds = Array.from(new Set(issueIds));
    const { issueIds: _issueIds, ...approvalInput } = req.body;
    const normalizedPayload =
      approvalInput.type === "hire_agent"
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            companyId,
            approvalInput.payload,
            { strictMode: strictSecretsMode },
          )
        : approvalInput.payload;

    // Eligibility guard: a "promote to market" approval can only be requested
    // for an entity that has actually finished its simulation phase — this
    // prevents someone from requesting promotion for something that was
    // never sim-tested. Checked BEFORE the approval row is created so an
    // ineligible request never enters the board's queue.
    if (approvalInput.type === "promote_to_live") {
      const promotePayload = (normalizedPayload ?? {}) as Record<string, unknown>;
      const entityType = promotePayload.entityType;
      const entityId = promotePayload.entityId;
      if (entityType !== "rq_submission" && entityType !== "marketplace_booking") {
        throw badRequest("payload.entityType must be 'rq_submission' or 'marketplace_booking'");
      }
      if (typeof entityId !== "string" || !entityId) {
        throw badRequest("payload.entityId is required");
      }

      if (entityType === "rq_submission") {
        const submission = await db
          .select()
          .from(rqSubmissions)
          .where(and(eq(rqSubmissions.id, entityId), eq(rqSubmissions.companyId, companyId)))
          .then((rows) => rows[0] ?? null);
        if (!submission) {
          throw notFound("RQ submission not found");
        }
        if (!(submission.isSimulation && submission.simulationStatus === "completed")) {
          throw unprocessable("RQ submission is not in a completed simulation state");
        }
      } else {
        const booking = await db
          .select()
          .from(lmsMarketplaceBookings)
          .where(and(eq(lmsMarketplaceBookings.id, entityId), eq(lmsMarketplaceBookings.companyId, companyId)))
          .then((rows) => rows[0] ?? null);
        if (!booking) {
          throw notFound("Marketplace booking not found");
        }
        if (!(booking.phase === "simulation" && booking.status === "completed")) {
          throw unprocessable("Marketplace booking is not in a completed simulation state");
        }
      }
    }

    // Eligibility guard: an "opprrc_delivery_review" approval can only be
    // requested for a delivery that belongs to this company and isn't
    // already mid-review or already decided — prevents duplicate pending
    // reviews for the same delivery. Checked BEFORE the approval row is
    // created, same convention as promote_to_live above. The matched
    // delivery's id is captured so it can be flipped to "pending_review"
    // once the approval is actually created (see below svc.create call).
    let opprrcReviewDeliveryId: string | null = null;
    if (approvalInput.type === "opprrc_delivery_review") {
      const reviewPayload = (normalizedPayload ?? {}) as Record<string, unknown>;
      const deliveryId = reviewPayload.deliveryId;
      if (typeof deliveryId !== "string" || !deliveryId) {
        throw badRequest("payload.deliveryId is required");
      }

      const delivery = await db
        .select()
        .from(opprrcDeliveries)
        .where(and(eq(opprrcDeliveries.id, deliveryId), eq(opprrcDeliveries.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!delivery) {
        throw notFound("Delivery not found");
      }
      if (!(delivery.reviewStatus === "not_submitted" || delivery.reviewStatus === "revision_requested")) {
        throw unprocessable("Delivery is already under review or already decided");
      }
      opprrcReviewDeliveryId = deliveryId;
    }

    const actor = getActorInfo(req);
    const approval = await svc.create(companyId, {
      ...approvalInput,
      payload: normalizedPayload,
      requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
      requestedByAgentId:
        approvalInput.requestedByAgentId ?? (actor.actorType === "agent" ? actor.actorId : null),
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });

    if (uniqueIssueIds.length > 0) {
      await issueApprovalsSvc.linkManyForApproval(approval.id, uniqueIssueIds, {
        agentId: actor.agentId,
        userId: actor.actorType === "user" ? actor.actorId : null,
      });
    }

    if (opprrcReviewDeliveryId) {
      // Non-blocking: the approval has already been created successfully at
      // this point, so a hiccup updating the delivery's reviewStatus must
      // never surface as a failure of the approval-creation request itself.
      try {
        await db
          .update(opprrcDeliveries)
          .set({ reviewStatus: "pending_review", updatedAt: new Date() })
          .where(eq(opprrcDeliveries.id, opprrcReviewDeliveryId));
      } catch (err) {
        logger.warn(
          { err, approvalId: approval.id, deliveryId: opprrcReviewDeliveryId },
          "failed to set delivery reviewStatus=pending_review after opprrc_delivery_review approval creation",
        );
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type, issueIds: uniqueIssueIds },
    });

    res.status(201).json(redactApprovalPayload(approval));
  });

  router.get("/approvals/:id/issues", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const issues = await issueApprovalsSvc.listIssuesForApproval(id);
    res.json(issues);
  });

  router.post("/approvals/:id/approve", validate(resolveApprovalSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const { approval, applied } = await svc.approve(
      id,
      req.body.decidedByUserId ?? "board",
      req.body.decisionNote,
    );

    if (applied) {
      const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(approval.id);
      const linkedIssueIds = linkedIssues.map((issue) => issue.id);
      const primaryIssueId = linkedIssueIds[0] ?? null;

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "approval.approved",
        entityType: "approval",
        entityId: approval.id,
        details: {
          type: approval.type,
          requestedByAgentId: approval.requestedByAgentId,
          linkedIssueIds,
        },
      });

      if (approval.type === "pit_stop_review") {
        // PIT STOP gate: promotion from SIM to LIVE only happens here, via an
        // approved pit_stop_review approval. The new run carries promotedFromRunId
        // so heartbeat advances the issue lifecycle from "pit_stop" to "live".
        const pitStopPayload = approval.payload as Record<string, unknown>;
        const simRunId = typeof pitStopPayload.simRunId === "string" ? pitStopPayload.simRunId : null;

        if (approval.requestedByAgentId) {
          try {
            const wakeRun = await heartbeat.wakeup(approval.requestedByAgentId, {
              source: "automation",
              triggerDetail: "system",
              reason: "pit_stop_approved",
              runMode: "live",
              promotedFromRunId: simRunId,
              payload: {
                approvalId: approval.id,
                approvalStatus: approval.status,
                issueId: primaryIssueId,
                simRunId,
              },
              requestedByActorType: "user",
              requestedByActorId: req.actor.userId ?? "board",
              contextSnapshot: {
                source: "approval.approved",
                approvalId: approval.id,
                approvalStatus: approval.status,
                issueId: primaryIssueId,
                issueIds: linkedIssueIds,
                taskId: primaryIssueId,
                wakeReason: "pit_stop_approved",
                promotedFromRunId: simRunId,
              },
            });

            await logActivity(db, {
              companyId: approval.companyId,
              actorType: "user",
              actorId: req.actor.userId ?? "board",
              action: "approval.pit_stop_promoted_to_live",
              entityType: "approval",
              entityId: approval.id,
              details: {
                requesterAgentId: approval.requestedByAgentId,
                wakeRunId: wakeRun?.id ?? null,
                simRunId,
                linkedIssueIds,
              },
            });
          } catch (err) {
            logger.warn(
              {
                err,
                approvalId: approval.id,
                requestedByAgentId: approval.requestedByAgentId,
              },
              "failed to promote SIM run to LIVE after PIT STOP approval",
            );
            await logActivity(db, {
              companyId: approval.companyId,
              actorType: "user",
              actorId: req.actor.userId ?? "board",
              action: "approval.pit_stop_promotion_failed",
              entityType: "approval",
              entityId: approval.id,
              details: {
                requesterAgentId: approval.requestedByAgentId,
                simRunId,
                linkedIssueIds,
                error: err instanceof Error ? err.message : String(err),
              },
            });
          }
        }
      } else if (approval.type === "promote_to_live") {
        // MARKET PROMOTION gate: flipping a sim-mode RQ submission or
        // marketplace booking to live only happens here, via an approved
        // promote_to_live approval. Mirrors the pit_stop_review branch above:
        // non-blocking try/catch + activity log on both outcomes.
        const promotePayload = approval.payload as Record<string, unknown>;
        const entityType = typeof promotePayload.entityType === "string" ? promotePayload.entityType : null;
        const entityId = typeof promotePayload.entityId === "string" ? promotePayload.entityId : null;

        try {
          if (entityType === "rq_submission" && entityId) {
            await db
              .update(rqSubmissions)
              .set({
                isSimulation: false,
                lifecycleStage: "live",
                simulationStatus: "certified",
                updatedAt: new Date(),
              })
              .where(eq(rqSubmissions.id, entityId));
          } else if (entityType === "marketplace_booking" && entityId) {
            const [booking] = await db
              .update(lmsMarketplaceBookings)
              .set({ phase: "live" })
              .where(eq(lmsMarketplaceBookings.id, entityId))
              .returning();

            // A promoted booking's listing becomes market-visible too — the
            // public catalog (directory-catalog.ts) only surfaces listings
            // with isPublic=true, so this is what makes the promotion
            // actually show up there. Best-effort: only touches listings
            // that aren't already public, never un-publishes one.
            if (booking?.listingId) {
              try {
                await db
                  .update(lmsMarketplaceListings)
                  .set({ isPublic: true, updatedAt: new Date() })
                  .where(and(eq(lmsMarketplaceListings.id, booking.listingId), eq(lmsMarketplaceListings.isPublic, false)));
              } catch (listingErr) {
                logger.warn(
                  { err: listingErr, approvalId: approval.id, listingId: booking.listingId },
                  "failed to publish listing to catalog after promote_to_live approval",
                );
              }
            }
          } else {
            throw new Error(`invalid promote_to_live payload: entityType=${entityType} entityId=${entityId}`);
          }

          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.promoted_to_live",
            entityType: "approval",
            entityId: approval.id,
            details: { entityType, entityId },
          });

          // Chain-of-custody record — best-effort, must never undo or block
          // a promotion the caller already believes succeeded.
          try {
            await amxChainService(db).recordSecurityEvent(
              approval.companyId,
              "user",
              req.actor.userId ?? "board",
              "MARKET_PROMOTION",
              { approvalId: approval.id, entityType, entityId },
            );
          } catch (chainErr) {
            logger.warn(
              { err: chainErr, approvalId: approval.id, entityType, entityId },
              "failed to record MARKET_PROMOTION chain event",
            );
          }
        } catch (err) {
          logger.warn(
            { err, approvalId: approval.id, entityType, entityId },
            "failed to promote entity to live after promote_to_live approval",
          );
          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.promote_to_live_failed",
            entityType: "approval",
            entityId: approval.id,
            details: {
              entityType,
              entityId,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      } else if (approval.type === "opprrc_delivery_review") {
        // OPPRRC board review gate: an approved opprrc_delivery_review
        // approval marks the underlying delivery's reviewStatus as
        // "approved". Mirrors the promote_to_live branch above: non-blocking
        // try/catch + activity log on both outcomes, best-effort chain event.
        const reviewPayload = approval.payload as Record<string, unknown>;
        const deliveryId = typeof reviewPayload.deliveryId === "string" ? reviewPayload.deliveryId : null;

        try {
          if (!deliveryId) {
            throw new Error("invalid opprrc_delivery_review payload: deliveryId missing");
          }
          await db
            .update(opprrcDeliveries)
            .set({ reviewStatus: "approved", updatedAt: new Date() })
            .where(eq(opprrcDeliveries.id, deliveryId));

          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.opprrc_delivery_approved",
            entityType: "approval",
            entityId: approval.id,
            details: { deliveryId },
          });

          // Chain-of-custody record — best-effort, must never undo or block
          // a decision the caller already believes succeeded.
          try {
            await amxChainService(db).recordSecurityEvent(
              approval.companyId,
              "user",
              req.actor.userId ?? "board",
              "OPPRRC_DELIVERY_APPROVED",
              { approvalId: approval.id, deliveryId },
            );
          } catch (chainErr) {
            logger.warn(
              { err: chainErr, approvalId: approval.id, deliveryId },
              "failed to record OPPRRC_DELIVERY_APPROVED chain event",
            );
          }
        } catch (err) {
          logger.warn(
            { err, approvalId: approval.id, deliveryId },
            "failed to update delivery reviewStatus after opprrc_delivery_review approval",
          );
          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.opprrc_delivery_review_apply_failed",
            entityType: "approval",
            entityId: approval.id,
            details: {
              deliveryId,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      } else if (approval.requestedByAgentId) {
        try {
          const wakeRun = await heartbeat.wakeup(approval.requestedByAgentId, {
            source: "automation",
            triggerDetail: "system",
            reason: "approval_approved",
            payload: {
              approvalId: approval.id,
              approvalStatus: approval.status,
              issueId: primaryIssueId,
              issueIds: linkedIssueIds,
            },
            requestedByActorType: "user",
            requestedByActorId: req.actor.userId ?? "board",
            contextSnapshot: {
              source: "approval.approved",
              approvalId: approval.id,
              approvalStatus: approval.status,
              issueId: primaryIssueId,
              issueIds: linkedIssueIds,
              taskId: primaryIssueId,
              wakeReason: "approval_approved",
            },
          });

          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.requester_wakeup_queued",
            entityType: "approval",
            entityId: approval.id,
            details: {
              requesterAgentId: approval.requestedByAgentId,
              wakeRunId: wakeRun?.id ?? null,
              linkedIssueIds,
            },
          });
        } catch (err) {
          logger.warn(
            {
              err,
              approvalId: approval.id,
              requestedByAgentId: approval.requestedByAgentId,
            },
            "failed to queue requester wakeup after approval",
          );
          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.requester_wakeup_failed",
            entityType: "approval",
            entityId: approval.id,
            details: {
              requesterAgentId: approval.requestedByAgentId,
              linkedIssueIds,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    }

    res.json(redactApprovalPayload(approval));
  });

  router.post("/approvals/:id/reject", validate(resolveApprovalSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const { approval, applied } = await svc.reject(
      id,
      req.body.decidedByUserId ?? "board",
      req.body.decisionNote,
    );

    if (applied) {
      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "approval.rejected",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type },
      });

      if (approval.type === "opprrc_delivery_review") {
        const reviewPayload = approval.payload as Record<string, unknown>;
        const deliveryId = typeof reviewPayload.deliveryId === "string" ? reviewPayload.deliveryId : null;
        try {
          if (!deliveryId) {
            throw new Error("invalid opprrc_delivery_review payload: deliveryId missing");
          }
          await db
            .update(opprrcDeliveries)
            .set({ reviewStatus: "rejected", updatedAt: new Date() })
            .where(eq(opprrcDeliveries.id, deliveryId));

          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.opprrc_delivery_rejected",
            entityType: "approval",
            entityId: approval.id,
            details: { deliveryId },
          });
        } catch (err) {
          logger.warn(
            { err, approvalId: approval.id, deliveryId },
            "failed to update delivery reviewStatus after opprrc_delivery_review rejection",
          );
          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.opprrc_delivery_review_apply_failed",
            entityType: "approval",
            entityId: approval.id,
            details: {
              deliveryId,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    }

    res.json(redactApprovalPayload(approval));
  });

  router.post(
    "/approvals/:id/request-revision",
    validate(requestApprovalRevisionSchema),
    async (req, res) => {
      assertBoard(req);
      const id = req.params.id as string;
      const approval = await svc.requestRevision(
        id,
        req.body.decidedByUserId ?? "board",
        req.body.decisionNote,
      );

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "approval.revision_requested",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type },
      });

      if (approval.type === "opprrc_delivery_review") {
        const reviewPayload = approval.payload as Record<string, unknown>;
        const deliveryId = typeof reviewPayload.deliveryId === "string" ? reviewPayload.deliveryId : null;
        try {
          if (!deliveryId) {
            throw new Error("invalid opprrc_delivery_review payload: deliveryId missing");
          }
          await db
            .update(opprrcDeliveries)
            .set({ reviewStatus: "revision_requested", updatedAt: new Date() })
            .where(eq(opprrcDeliveries.id, deliveryId));

          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.opprrc_delivery_revision_requested",
            entityType: "approval",
            entityId: approval.id,
            details: { deliveryId },
          });
        } catch (err) {
          logger.warn(
            { err, approvalId: approval.id, deliveryId },
            "failed to update delivery reviewStatus after opprrc_delivery_review revision request",
          );
          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.opprrc_delivery_review_apply_failed",
            entityType: "approval",
            entityId: approval.id,
            details: {
              deliveryId,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }

      res.json(redactApprovalPayload(approval));
    },
  );

  router.post("/approvals/:id/escalate", validate(escalateApprovalSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const approval = await svc.escalate(
      id,
      req.body.decidedByUserId ?? "board",
      req.body.decisionNote,
    );

    await logActivity(db, {
      companyId: approval.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "approval.escalated",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type },
    });

    res.json(redactApprovalPayload(approval));
  });

  router.post("/approvals/:id/resubmit", validate(resubmitApprovalSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    if (req.actor.type === "agent" && req.actor.agentId !== existing.requestedByAgentId) {
      res.status(403).json({ error: "Only requesting agent can resubmit this approval" });
      return;
    }

    const normalizedPayload = req.body.payload
      ? existing.type === "hire_agent"
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            existing.companyId,
            req.body.payload,
            { strictMode: strictSecretsMode },
          )
        : req.body.payload
      : undefined;
    const approval = await svc.resubmit(id, normalizedPayload);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: approval.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.resubmitted",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type },
    });
    res.json(redactApprovalPayload(approval));
  });

  router.get("/approvals/:id/comments", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const comments = await svc.listComments(id);
    res.json(comments);
  });

  router.post("/approvals/:id/comments", validate(addApprovalCommentSchema), async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const actor = getActorInfo(req);
    const comment = await svc.addComment(id, req.body.body, {
      agentId: actor.agentId ?? undefined,
      userId: actor.actorType === "user" ? actor.actorId : undefined,
    });

    await logActivity(db, {
      companyId: approval.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.comment_added",
      entityType: "approval",
      entityId: approval.id,
      details: { commentId: comment.id },
    });

    res.status(201).json(comment);
  });

  return router;
}

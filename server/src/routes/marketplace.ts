import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  agents,
  amxTransactions,
  companies,
  issues,
  issueWorkProducts,
  marketplaceListings,
  marketplaceProfiles,
} from "@paperclipai/db";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { badRequest, unauthorized } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, assertInstanceAdmin, getActorInfo } from "./authz.js";
import { marketplaceService } from "../services/marketplace.js";
import {
  buildMicroserviceWorkOrderMetadata,
  MICROSERVICE_WORK_ORDER_EXTERNAL_ID,
  MICROSERVICE_WORK_ORDER_PROVIDER,
  summarizeMicroserviceWorkOrder,
} from "../services/microservice-work-order.js";

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
  headline: z.string().trim().min(1).max(120).nullable().optional(),
  bio: z.string().trim().min(1).max(1200).nullable().optional(),
  location: z.string().trim().min(1).max(120).nullable().optional(),
  roleIntent: z.enum(["none", "member", "partner"]).optional(),
  payoutWallet: z.string().trim().min(1).max(200).nullable().optional(),
  availability: z.string().trim().min(1).max(80).nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(24).optional(),
  badges: z.array(z.string().trim().min(1).max(60)).max(24).optional(),
  supportedRunPhases: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
});

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reviewReason: z.string().trim().max(500).optional(),
});

const listingSchema = z.object({
  listingType: z.enum(["agent", "coop", "team"]),
  name: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1200),
  skills: z.array(z.string().trim().min(1).max(60)).max(24).default([]),
  badges: z.array(z.string().trim().min(1).max(60)).max(24).default([]),
  hourlyRateTokens: z.number().int().positive(),
  availability: z.string().trim().max(80).nullable().optional(),
  supportedRunPhases: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  payoutWallet: z.string().trim().max(200).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
});

const updateListingSchema = listingSchema.partial().extend({
  status: z.enum(["draft", "active", "paused"]).optional(),
  isPromoted: z.boolean().optional(),
  promotedUntil: z.string().datetime().nullable().optional(),
  sponsorTag: z.string().trim().max(120).nullable().optional(),
});

const purchaseSchema = z.object({
  hours: z.number().int().min(1).max(40),
  runPhase: z.string().trim().min(1).max(30),
});

const microserviceBookingSchema = purchaseSchema.extend({
  listingId: z.string().uuid(),
  taskType: z.enum([
    "image_generate",
    "image_edit",
    "video",
    "audio",
    "webhook",
    "browser_task",
    "custom",
  ]),
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(5000),
  targetUrl: z.string().trim().url().max(2000).optional().nullable(),
  assignedAgentId: z.string().uuid().optional().nullable(),
  clientName: z.string().trim().min(1).max(120).optional().nullable(),
  clientEmail: z.string().trim().email().max(320).optional().nullable(),
  clientCompany: z.string().trim().min(1).max(160).optional().nullable(),
});

const topUpSchema = z.object({
  balanceType: z.enum(["lms", "tokens"]),
  amount: z.number().int().positive(),
});

const REQUIRED_MICROSERVICE_SKILLS = [
  "image-microservice-router",
  "video-microservice-router",
  "audio-microservice-router",
  "ondemand-webhook-intake",
];

function getCurrentUserId(req: Parameters<typeof getActorInfo>[0]) {
  const actor = getActorInfo(req);
  if (actor.actorType !== "user") throw unauthorized();
  return actor.actorId;
}

function getDesiredSkills(agentConfig: Record<string, unknown> | null | undefined) {
  const sync = agentConfig?.paperclipSkillSync;
  if (!sync || typeof sync !== "object") return [];
  const desiredSkills = (sync as { desiredSkills?: unknown }).desiredSkills;
  if (!Array.isArray(desiredSkills)) return [];
  return desiredSkills.filter((skill): skill is string => typeof skill === "string");
}

function getMissingMicroserviceSkills(skills: string[]) {
  const normalized = new Set(skills.map((skill) => skill.toLowerCase()));
  return REQUIRED_MICROSERVICE_SKILLS.filter((required) =>
    !Array.from(normalized).some((skill) => skill.endsWith(required) || skill === required),
  );
}

function buildMicroserviceIssueDescription(input: z.infer<typeof microserviceBookingSchema>, listing: typeof marketplaceListings.$inferSelect) {
  return [
    "AMX Microservice Booking",
    "",
    `Listing: ${listing.title} (${listing.name})`,
    `Listing ID: ${listing.id}`,
    `Provider: ${listing.providerUserId}`,
    `Task Type: ${input.taskType}`,
    `Run Phase: ${input.runPhase}`,
    `Hours: ${input.hours}`,
    input.targetUrl ? `Target URL: ${input.targetUrl}` : null,
    "",
    "Instructions:",
    input.instructions,
  ].filter((line): line is string => line !== null).join("\n");
}

export function marketplaceRoutes(db: Db) {
  const router = Router();
  const svc = marketplaceService(db);

  router.get("/marketplace/me/profile", async (req, res) => {
    const userId = getCurrentUserId(req);
    const displayName = await svc.getAuthUserName(userId);
    const profile = await svc.ensureProfile(userId, { displayName });
    const readiness = await svc.summarizeReadiness(userId);
    res.json({
      profile,
      eligibility: readiness.eligibility,
      guidance: readiness.guidance,
      viewer: {
        userId,
        isInstanceAdmin: req.actor.type === "board" ? Boolean(req.actor.isInstanceAdmin) : false,
        source: req.actor.source,
      },
    });
  });

  router.patch("/marketplace/me/profile", validate(updateProfileSchema), async (req, res) => {
    const userId = getCurrentUserId(req);
    const profile = await svc.updateProfile(userId, req.body);
    const readiness = await svc.summarizeReadiness(userId);
    res.json({ profile, eligibility: readiness.eligibility, guidance: readiness.guidance });
  });

  router.get("/marketplace/me/eligibility", async (req, res) => {
    const userId = getCurrentUserId(req);
    const { profile, summary } = await svc.syncEligibility(userId);
    const readiness = await svc.summarizeReadiness(userId);
    res.json({ profile, eligibility: summary, guidance: readiness.guidance });
  });

  router.get("/marketplace/me/partner-review", async (req, res) => {
    const userId = getCurrentUserId(req);
    const profile = await svc.ensureProfile(userId);
    const readiness = await svc.summarizeReadiness(userId);
    res.json({
      partnerStatus: profile.partnerStatus,
      reviewReason: profile.reviewReason,
      applicationSubmittedAt: profile.applicationSubmittedAt,
      reviewedAt: profile.reviewedAt,
      eligibility: readiness.eligibility,
      guidance: readiness.guidance,
    });
  });

  router.post("/marketplace/me/partner-application", async (req, res) => {
    const userId = getCurrentUserId(req);
    const profile = await svc.submitPartnerApplication(userId);
    const readiness = await svc.summarizeReadiness(userId);
    res.status(201).json({ profile, eligibility: readiness.eligibility, guidance: readiness.guidance });
  });

  router.post("/marketplace/me/top-up", validate(topUpSchema), async (req, res) => {
    const userId = getCurrentUserId(req);
    const profile = await svc.topUpBalance(userId, req.body.balanceType, req.body.amount);
    res.json({ profile });
  });

  router.get("/marketplace/admin/partner-applications", async (req, res) => {
    assertInstanceAdmin(req);
    const applications = await svc.listPendingApplications();
    res.json(applications);
  });

  router.post(
    "/marketplace/admin/partner-applications/:userId/review",
    validate(reviewSchema),
    async (req, res) => {
      const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      assertInstanceAdmin(req);
      const profile = await svc.reviewPartnerApplication(targetUserId, req.body);
      const readiness = await svc.summarizeReadiness(targetUserId);
      res.json({ profile, eligibility: readiness.eligibility, guidance: readiness.guidance });
    },
  );

  router.get("/companies/:companyId/amx/partner-listings", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const userId = req.actor.type === "board" ? req.actor.userId ?? null : null;
    const listings = await svc.listListings(companyId, userId);
    res.json(listings);
  });

  // Public marketplace: active listings + agents with marketplaceVisible=true
  router.get("/marketplace/public-listings", async (req, res) => {
    // Fetch active marketplace listings (isPromoted first)
    const listings = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.status, "active"))
      .orderBy(desc(marketplaceListings.isPromoted), desc(marketplaceListings.createdAt));

    // Fetch agents with marketplaceVisible=true in their metadata
    const visibleAgents = await db
      .select({
        id: agents.id,
        name: agents.name,
        title: agents.title,
        role: agents.role,
        companyId: agents.companyId,
        metadata: agents.metadata,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(
        and(
          eq(sql`(${agents.metadata}->>'marketplaceVisible')::boolean`, true),
          or(
            eq(agents.status, "idle"),
            eq(agents.status, "running"),
          ),
        ),
      );

    res.json({ listings, visibleAgents });
  });

  router.post(
    "/companies/:companyId/amx/partner-listings",
    validate(listingSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const userId = getCurrentUserId(req);
      const listing = await svc.createListing(companyId, userId, req.body);
      res.status(201).json(listing);
    },
  );

  router.patch(
    "/companies/:companyId/amx/partner-listings/:listingId",
    validate(updateListingSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const listingId = Array.isArray(req.params.listingId) ? req.params.listingId[0] : req.params.listingId;
      assertCompanyAccess(req, companyId);
      const isBoard = req.actor.type === "board";
      if (isBoard) {
        // Board actors can promote any listing without partner/ownership checks
        const listing = await svc.promoteListingAsBoard(listingId, req.body);
        return res.json(listing);
      }
      const userId = getCurrentUserId(req);
      const listing = await svc.updateListing(companyId, listingId, userId, req.body, { allowPromotion: false });
      res.json(listing);
    },
  );

  router.post(
    "/companies/:companyId/amx/partner-listings/:listingId/purchase",
    validate(purchaseSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const buyerUserId = getCurrentUserId(req);
      const listingId = Array.isArray(req.params.listingId) ? req.params.listingId[0] : req.params.listingId;

      const listing = await db
        .select({
          profile: marketplaceProfiles,
          listing: marketplaceListings,
        })
        .from(marketplaceProfiles)
        .innerJoin(marketplaceListings, eq(marketplaceListings.providerUserId, marketplaceProfiles.userId))
        .where(and(eq(marketplaceListings.id, listingId), eq(marketplaceListings.companyId, companyId)))
        .then((rows) => rows[0] ?? null);

      if (!listing) {
        throw badRequest("Marketplace listing not found.");
      }

      const listingRow = listing.listing;
      const sellerProfile = listing.profile;
      if (listingRow.providerUserId === buyerUserId) {
        throw badRequest("You cannot purchase your own listing.");
      }
      if (listingRow.status !== "active") {
        throw badRequest("Only active listings can be purchased.");
      }

      const buyerProfile = await svc.ensureProfile(buyerUserId, { displayName: await svc.getAuthUserName(buyerUserId) });
      const seller = await svc.ensureProfile(sellerProfile.userId, {
        displayName: sellerProfile.displayName,
      });

      const totalCostTokens = listingRow.hourlyRateTokens * req.body.hours;
      const platformFeeTokens = Math.max(1, Math.round(totalCostTokens * 0.1));
      const providerPayoutTokens = totalCostTokens - platformFeeTokens;

      if (buyerProfile.amxTokenBalance < totalCostTokens) {
        throw badRequest("Insufficient AMX token balance.");
      }

      await db.transaction(async (tx) => {
        await tx
          .update(marketplaceProfiles)
          .set({
            amxTokenBalance: buyerProfile.amxTokenBalance - totalCostTokens,
            updatedAt: new Date(),
          })
          .where(eq(marketplaceProfiles.userId, buyerUserId));

        await tx
          .update(marketplaceProfiles)
          .set({
            amxTokenBalance: seller.amxTokenBalance + providerPayoutTokens,
            updatedAt: new Date(),
          })
          .where(eq(marketplaceProfiles.userId, seller.userId));

        await tx.insert(amxTransactions).values({
          fromCompanyId: companyId,
          toCompanyId: companyId,
          fromPrincipalType: "user",
          fromPrincipalId: buyerUserId,
          toPrincipalType: "user",
          toPrincipalId: seller.userId,
          amount: providerPayoutTokens,
          currency: "AMX",
          transactionType: "marketplace_booking",
          status: "completed",
          metadata: {
            listingId,
            listingType: listingRow.listingType,
            hours: req.body.hours,
            runPhase: req.body.runPhase,
            totalCostTokens,
            platformFeeTokens,
            providerPayoutTokens,
          },
        });
      });

      const refreshedBuyer = await svc.ensureProfile(buyerUserId);
      const refreshedSeller = await svc.ensureProfile(seller.userId);
      res.status(201).json({
        ok: true,
        listingId,
        totalCostTokens,
        platformFeeTokens,
        providerPayoutTokens,
        buyerBalance: refreshedBuyer.amxTokenBalance,
        providerBalance: refreshedSeller.amxTokenBalance,
      });
    },
  );

  router.post(
    "/companies/:companyId/amx/microservice-bookings",
    validate(microserviceBookingSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const buyerUserId = getCurrentUserId(req);
      const input = req.body as z.infer<typeof microserviceBookingSchema>;

      const listing = await db
        .select({
          profile: marketplaceProfiles,
          listing: marketplaceListings,
        })
        .from(marketplaceProfiles)
        .innerJoin(marketplaceListings, eq(marketplaceListings.providerUserId, marketplaceProfiles.userId))
        .where(and(eq(marketplaceListings.id, input.listingId), eq(marketplaceListings.companyId, companyId)))
        .then((rows) => rows[0] ?? null);

      if (!listing) throw badRequest("Marketplace listing not found.");
      const listingRow = listing.listing;
      const sellerProfile = listing.profile;
      if (listingRow.providerUserId === buyerUserId) {
        throw badRequest("You cannot purchase your own listing.");
      }
      if (listingRow.status !== "active") {
        throw badRequest("Only active listings can be booked.");
      }

      const listingMissingSkills = getMissingMicroserviceSkills(listingRow.skills ?? []);
      if (listingMissingSkills.length > 0) {
        throw badRequest(`Listing is missing required microservice skills: ${listingMissingSkills.join(", ")}.`);
      }

      let assignedAgent: typeof agents.$inferSelect | null = null;
      let assignedMissingSkills: string[] = [];
      if (input.assignedAgentId) {
        assignedAgent = await db
          .select()
          .from(agents)
          .where(and(eq(agents.id, input.assignedAgentId), eq(agents.companyId, companyId)))
          .then((rows) => rows[0] ?? null);
        if (!assignedAgent) throw badRequest("Assigned agent not found for this company.");
        if (assignedAgent.status === "pending_approval" || assignedAgent.status === "terminated") {
          throw badRequest("Assigned agent is not available for microservice work.");
        }
        assignedMissingSkills = getMissingMicroserviceSkills(getDesiredSkills(assignedAgent.adapterConfig));
      }

      const buyerProfile = await svc.ensureProfile(buyerUserId, { displayName: await svc.getAuthUserName(buyerUserId) });
      const seller = await svc.ensureProfile(sellerProfile.userId, {
        displayName: sellerProfile.displayName,
      });
      const totalCostTokens = listingRow.hourlyRateTokens * input.hours;
      const platformFeeTokens = Math.max(1, Math.round(totalCostTokens * 0.1));
      const providerPayoutTokens = totalCostTokens - platformFeeTokens;
      if (buyerProfile.amxTokenBalance < totalCostTokens) {
        throw badRequest("Insufficient AMX token balance.");
      }

      const result = await db.transaction(async (tx) => {
        const now = new Date();
        await tx
          .update(marketplaceProfiles)
          .set({
            amxTokenBalance: buyerProfile.amxTokenBalance - totalCostTokens,
            updatedAt: now,
          })
          .where(eq(marketplaceProfiles.userId, buyerUserId));

        await tx
          .update(marketplaceProfiles)
          .set({
            amxTokenBalance: seller.amxTokenBalance + providerPayoutTokens,
            updatedAt: now,
          })
          .where(eq(marketplaceProfiles.userId, seller.userId));

        const transaction = await tx.insert(amxTransactions).values({
          fromCompanyId: companyId,
          toCompanyId: companyId,
          fromPrincipalType: "user",
          fromPrincipalId: buyerUserId,
          toPrincipalType: "user",
          toPrincipalId: seller.userId,
          amount: providerPayoutTokens,
          currency: "AMX",
          transactionType: "microservice_booking",
          status: "completed",
          metadata: {
            listingId: input.listingId,
            listingType: listingRow.listingType,
            taskType: input.taskType,
            hours: input.hours,
            runPhase: input.runPhase,
            totalCostTokens,
            platformFeeTokens,
            providerPayoutTokens,
            assignedAgentId: input.assignedAgentId ?? null,
          },
        }).returning().then((rows) => rows[0]);

        const company = await tx
          .update(companies)
          .set({ issueCounter: sql`${companies.issueCounter} + 1` })
          .where(eq(companies.id, companyId))
          .returning({ issueCounter: companies.issueCounter, issuePrefix: companies.issuePrefix })
          .then((rows) => rows[0]);

        const issueNumber = company.issueCounter;
        const issue = await tx.insert(issues).values({
          companyId,
          issueNumber,
          identifier: `${company.issuePrefix}-${issueNumber}`,
          title: `[MICROSERVICE] ${input.title}`,
          description: buildMicroserviceIssueDescription(input, listingRow),
          status: "todo",
          priority: input.taskType === "webhook" ? "high" : "medium",
          assigneeAgentId: input.assignedAgentId ?? null,
          createdByUserId: buyerUserId,
          originKind: "manual",
          originId: `microservice-booking:${transaction.id}`,
          billingCode: "amx_microservice_booking",
          assigneeAdapterOverrides: {
            microserviceBooking: {
              listingId: input.listingId,
              transactionId: transaction.id,
              taskType: input.taskType,
              runPhase: input.runPhase,
              targetUrl: input.targetUrl ?? null,
              clientName: input.clientName ?? null,
              clientEmail: input.clientEmail ?? null,
              clientCompany: input.clientCompany ?? null,
            },
          },
        }).returning().then((rows) => rows[0]);

        const workOrderMetadata = buildMicroserviceWorkOrderMetadata({
          listingId: input.listingId,
          transactionId: transaction.id,
          taskType: input.taskType,
          runPhase: input.runPhase,
          targetUrl: input.targetUrl ?? null,
          title: input.title,
          instructions: input.instructions,
          clientName: input.clientName ?? null,
          clientEmail: input.clientEmail ?? null,
          clientCompany: input.clientCompany ?? null,
        });

        await tx.insert(issueWorkProducts).values({
          companyId,
          projectId: issue.projectId ?? null,
          issueId: issue.id,
          type: "document",
          provider: MICROSERVICE_WORK_ORDER_PROVIDER,
          externalId: MICROSERVICE_WORK_ORDER_EXTERNAL_ID,
          title: "Microservice Work Order",
          status: "active",
          reviewState: "none",
          isPrimary: false,
          healthStatus: "healthy",
          summary: summarizeMicroserviceWorkOrder(workOrderMetadata),
          metadata: workOrderMetadata as Record<string, unknown>,
          createdByRunId: null,
        });

        return { transaction, issue };
      });

      const refreshedBuyer = await svc.ensureProfile(buyerUserId);
      const refreshedSeller = await svc.ensureProfile(seller.userId);
      res.status(201).json({
        ok: true,
        purchase: {
          listingId: input.listingId,
          totalCostTokens,
          platformFeeTokens,
          providerPayoutTokens,
          buyerBalance: refreshedBuyer.amxTokenBalance,
          providerBalance: refreshedSeller.amxTokenBalance,
          transactionId: result.transaction.id,
        },
        issue: {
          id: result.issue.id,
          identifier: result.issue.identifier,
          title: result.issue.title,
          status: result.issue.status,
          assigneeAgentId: result.issue.assigneeAgentId,
        },
        listing: listingRow,
        microserviceReady: {
          listing: {
            ready: listingMissingSkills.length === 0,
            missingSkills: listingMissingSkills,
          },
          assignedAgent: input.assignedAgentId
            ? {
                id: input.assignedAgentId,
                name: assignedAgent?.name ?? null,
                ready: assignedMissingSkills.length === 0,
                missingSkills: assignedMissingSkills,
              }
            : null,
        },
      });
    },
  );

  router.get("/companies/:companyId/amx/partner-purchases", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const userId = getCurrentUserId(req);
    const purchases = await db
      .select()
      .from(amxTransactions)
      .where(
        and(
          eq(amxTransactions.fromCompanyId, companyId),
          eq(amxTransactions.transactionType, "marketplace_booking"),
          eq(amxTransactions.fromPrincipalId, userId),
        ),
      )
      .orderBy(desc(amxTransactions.occurredAt));

    res.json(purchases);
  });

  return router;
}

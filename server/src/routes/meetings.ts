import { Router } from "express";
import { eq, desc, count, and } from "drizzle-orm";
import { RoomServiceClient } from "livekit-server-sdk";
import type { Db } from "@paperclipai/db";
import { meetings, meetingTranscripts, meetingOutcomes } from "@paperclipai/db";
import { ISSUE_STATUSES } from "@paperclipai/shared";
import { forbidden, notFound, unprocessable } from "../errors.js";
import { recordingService, meetingAgentService as createMeetingAgentService, issueService, logActivity, pushNotificationService, accessService } from "../services/index.js";
import { publishLiveEvent } from "../services/live-events.js";
import { logger } from "../middleware/logger.js";
import { assertCompanyAccess, assertCompanyRole, getActorInfo } from "./authz.js";

/** Real, live participant counts for active meetings — one batched LiveKit
 * call, not N+1. Returns a map of meetingId -> occupancy count. Silently
 * returns an empty map if LiveKit isn't configured or the call fails (this
 * is a nice-to-have indicator, not something that should break the list). */
async function fetchOccupancy(activeMeetingIds: string[]): Promise<Map<string, number>> {
  const occupancy = new Map<string, number>();
  if (activeMeetingIds.length === 0) return occupancy;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !livekitUrl) return occupancy;

  try {
    const httpUrl = livekitUrl.replace("wss://", "https://").replace("ws://", "http://");
    const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    const roomNames = activeMeetingIds.map((id) => `meeting-${id}`);
    const rooms = await roomService.listRooms(roomNames);
    for (const room of rooms) {
      const meetingId = room.name.startsWith("meeting-") ? room.name.slice("meeting-".length) : null;
      if (meetingId) occupancy.set(meetingId, room.numParticipants);
    }
  } catch (err) {
    logger.warn({ err }, "failed to fetch live meeting occupancy (non-blocking)");
  }
  return occupancy;
}

/**
 * AMX LABS Meetings API factory
 */
type HeartbeatService = { wakeup: (agentId: string, opts?: Record<string, unknown>) => Promise<void> };

export function meetingsRouter(db: Db, heartbeat?: HeartbeatService) {
  const router = Router();
  const meetingAgentSvc = createMeetingAgentService(db, heartbeat);
  const issueSvc = issueService(db);
  const pushSvc = pushNotificationService(db);
  const accessSvc = accessService(db);

  router.get("/", async (req, res) => {
    const companyId = req.query.companyId as string;
    if (!companyId) throw forbidden("Company ID required");
    assertCompanyAccess(req, companyId);

    const results = await db
      .select()
      .from(meetings)
      .where(eq(meetings.companyId, companyId))
      .orderBy(desc(meetings.createdAt));

    // Real occupancy for active meetings only — one batched LiveKit call.
    const activeMeetingIds = results.filter((m) => m.status === "active").map((m) => m.id);
    const occupancy = await fetchOccupancy(activeMeetingIds);

    // Enrich each meeting with outcome + transcript counts
    const enriched = await Promise.all(results.map(async (meeting) => {
      const [transcriptRow] = await db
        .select({ total: count() })
        .from(meetingTranscripts)
        .where(eq(meetingTranscripts.meetingId, meeting.id));

      const [decisionsRow] = await db
        .select({ total: count() })
        .from(meetingOutcomes)
        .where(and(eq(meetingOutcomes.meetingId, meeting.id), eq(meetingOutcomes.type, "decision")));

      const [risksRow] = await db
        .select({ total: count() })
        .from(meetingOutcomes)
        .where(and(eq(meetingOutcomes.meetingId, meeting.id), eq(meetingOutcomes.type, "risk")));

      return {
        ...meeting,
        insightsCount: transcriptRow?.total ?? 0,
        approvedCount: decisionsRow?.total ?? 0,
        risksCount: risksRow?.total ?? 0,
        occupancy: meeting.status === "active" ? { count: occupancy.get(meeting.id) ?? 0 } : null,
      };
    }));

    res.json(enriched);
  });

  router.post("/", async (req, res) => {
    const { companyId, title, type, issueId } = req.body;
    if (!companyId || !title) throw forbidden("Missing required fields");
    assertCompanyAccess(req, companyId);
    assertCompanyRole(req, companyId, "member");

    if (issueId) {
      const issue = await issueSvc.getById(issueId);
      if (!issue || issue.companyId !== companyId) {
        throw notFound("Issue not found");
      }
    }

    const [meeting] = await db
      .insert(meetings)
      .values({
        companyId,
        title,
        type: type ?? "standup",
        status: "active",
        issueId: issueId ?? null,
      })
      .returning();

    publishLiveEvent({ companyId, type: "meeting.started", payload: { meetingId: meeting.id, title } });

    // Best-effort push to subscribed devices — reaches users who aren't
    // currently connected via WebSocket (the live-event above only reaches
    // already-open tabs). No-ops silently if push isn't configured.
    void pushSvc.notifyCompany(companyId, {
      title: "Meeting started",
      body: title,
      url: `/meetings/${meeting.id}`,
    }).catch((err) => logger.warn({ err, meetingId: meeting.id }, "meeting-started push notification failed"));

    res.json(meeting);
  });

  router.get("/:id", async (req, res) => {
    const meetingId = req.params.id;
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
      
    if (!meeting) throw notFound("Meeting not found");
    assertCompanyAccess(req, meeting.companyId);

    const transcripts = await db
      .select()
      .from(meetingTranscripts)
      .where(eq(meetingTranscripts.meetingId, meetingId))
      .orderBy(meetingTranscripts.timestampOffset);

    const participants = await meetingAgentSvc.getParticipants(meetingId);
    const outcomes = await meetingAgentSvc.getOutcomes(meetingId);
      
    res.json({ ...meeting, transcripts, participants, outcomes });
  });

  router.post("/:id/transcript", async (req, res) => {
    const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
    if (!mtg) throw notFound("Meeting not found");
    assertCompanyAccess(req, mtg.companyId);
    assertCompanyRole(req, mtg.companyId, "member");

    const { actorType, actorId, text, timestampOffset } = req.body;

    const transcript = await meetingAgentSvc.processInteraction(req.params.id, {
      actorType,
      actorId,
      text,
      timestampOffset,
    });

    publishLiveEvent({ companyId: mtg.companyId, type: "meeting.transcript.added", payload: { meetingId: req.params.id } });

    res.json(transcript);
  });

  router.post("/:id/invite", async (req, res) => {
    const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
    if (!mtg) throw notFound("Meeting not found");
    assertCompanyAccess(req, mtg.companyId);
    assertCompanyRole(req, mtg.companyId, "member");

    const { agentId, userId } = req.body as { agentId?: string; userId?: string };
    if (!agentId && !userId) throw unprocessable("agentId or userId is required");
    if (agentId && userId) throw unprocessable("Provide only one of agentId or userId");

    let participant;
    if (userId) {
      // Only active company members can be invited as staff participants.
      const membership = await accessSvc.getMembership(mtg.companyId, "user", userId);
      if (!membership || membership.status !== "active") {
        throw forbidden("User is not an active member of this company");
      }
      participant = await meetingAgentSvc.inviteStaff(req.params.id, userId);
    } else {
      participant = await meetingAgentSvc.inviteAgent(req.params.id, agentId as string);
    }

    publishLiveEvent({ companyId: mtg.companyId, type: "meeting.participant.joined", payload: { meetingId: req.params.id, agentId, userId } });

    res.json(participant);
  });

  router.get("/:id/participants", async (req, res) => {
    const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
    if (!mtg) throw notFound("Meeting not found");
    assertCompanyAccess(req, mtg.companyId);

    const participants = await meetingAgentSvc.getParticipants(req.params.id);
    res.json(participants);
  });

  router.get("/:id/outcomes", async (req, res) => {
    const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
    if (!mtg) throw notFound("Meeting not found");
    assertCompanyAccess(req, mtg.companyId);

    const outcomes = await meetingAgentSvc.getOutcomes(req.params.id);
    res.json(outcomes);
  });

  router.post("/:id/recording", async (req, res) => {
    const meetingId = req.params.id;
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
      
    if (!meeting) throw notFound("Meeting not found");
    assertCompanyAccess(req, meeting.companyId);
    assertCompanyRole(req, meeting.companyId, "member");

    await db
      .update(meetings)
      .set({
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    // Log meeting outcomes to agent memories so agents retain decisions/risks/actions
    try {
      await meetingAgentSvc.logOutcomesToMemory(meetingId, meeting.companyId);
    } catch (err) {
      logger.warn({ err, meetingId }, "Failed to log meeting outcomes to agent memories");
    }

    publishLiveEvent({ companyId: meeting.companyId, type: "meeting.ended", payload: { meetingId } });

    res.json({ success: true });
  });

  router.get("/:id/recording", async (req, res) => {
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, req.params.id))
      .limit(1);
      
    if (!meeting) throw notFound("Meeting not found");
    assertCompanyAccess(req, meeting.companyId);

    const stream = await recordingService.getRecordingStream(meeting.companyId, meeting.id);
    if (!stream) throw notFound("Recording not found");
    
    res.setHeader("Content-Type", "audio/webm");
    stream.pipe(res);
  });

  /**
   * POST /:id/actions
   *
   * Executes a real CRUD action requested by the voice agent (or chat input)
   * during a live meeting, then logs it to the meeting transcript so it's
   * visible in the room. Reuses the same issueService methods (and therefore
   * the same activity-log + validation behavior) as the standard REST routes
   * — this is not a parallel implementation.
   *
   * Body: { action: "create_issue" | "update_issue_status" | "get_issue_context", params: {...} }
   *
   * get_issue_context is a read-only lookup (no mutation, no transcript
   * entry) so the voice agent can speak an issue's current state before
   * changing it — used by update_issue_status in voice-agent/agent.py.
   *
   * Note: issue creation/status-update in this codebase does not currently
   * gate on a separate approval step (approvals are linked to existing
   * issues, not a precondition of mutating them) — so unlike the plan's
   * original "pending approval" framing, this endpoint performs the action
   * directly, exactly like the equivalent REST route would. If that changes
   * (e.g. a future governed-action check is added to issueService), it will
   * surface here automatically since the same service call is reused.
   */
  router.post("/:id/actions", async (req, res) => {
    const [mtg] = await db.select({ companyId: meetings.companyId, issueId: meetings.issueId }).from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
    if (!mtg) throw notFound("Meeting not found");
    assertCompanyAccess(req, mtg.companyId);
    assertCompanyRole(req, mtg.companyId, "member");

    const { action, params } = req.body as { action?: string; params?: Record<string, unknown> };
    const actor = getActorInfo(req);
    const p = params ?? {};

    // Read-only — return immediately, no transcript entry or activity log.
    if (action === "get_issue_context") {
      const issueId = typeof p.issueId === "string" ? p.issueId : mtg.issueId;
      if (!issueId) {
        res.json({ result: null, summary: "This meeting isn't linked to an issue." });
        return;
      }
      const issue = await issueSvc.getById(issueId);
      if (!issue || issue.companyId !== mtg.companyId) throw notFound("Issue not found");
      res.json({ result: issue, summary: `${issue.identifier}: ${issue.title} — status ${issue.status}` });
      return;
    }

    let result: unknown;
    let summary: string;

    if (action === "create_issue") {
      const title = typeof p.title === "string" ? p.title.trim() : "";
      if (!title) throw unprocessable("title is required");

      const issue = await issueSvc.create(mtg.companyId, {
        title,
        description: typeof p.description === "string" ? p.description : null,
      });

      await logActivity(db, {
        companyId: mtg.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.created",
        entityType: "issue",
        entityId: issue.id,
        details: { title: issue.title, identifier: issue.identifier, source: "meeting" },
      });

      result = issue;
      summary = `Created issue ${issue.identifier}: ${issue.title}`;
    } else if (action === "update_issue_status") {
      // Falls back to the meeting's own linked issue (if any) so the agent
      // doesn't need to restate the id when it's already the meeting's topic.
      const issueId = typeof p.issueId === "string" ? p.issueId : (mtg.issueId ?? "");
      const status = typeof p.status === "string" ? p.status : "";
      if (!issueId) throw unprocessable("issueId is required");
      if (!ISSUE_STATUSES.includes(status as (typeof ISSUE_STATUSES)[number])) {
        throw unprocessable(`status must be one of: ${ISSUE_STATUSES.join(", ")}`);
      }

      const existing = await issueSvc.getById(issueId);
      if (!existing || existing.companyId !== mtg.companyId) {
        throw notFound("Issue not found");
      }

      const issue = await issueSvc.update(issueId, { status: status as (typeof ISSUE_STATUSES)[number] });

      await logActivity(db, {
        companyId: mtg.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.updated",
        entityType: "issue",
        entityId: issueId,
        details: { status, source: "meeting" },
      });

      result = issue;
      summary = `Updated ${existing.identifier} status to ${status}`;
    } else if (action === "add_outcome") {
      // Attach a generic outcome to the meeting — used by the canvas
      // "Save snapshot" flow (type "artifact", content = JSON metadata).
      const type = typeof p.type === "string" && p.type.trim() ? p.type.trim() : "";
      const content = typeof p.content === "string" && p.content.trim() ? p.content : "";
      if (!type) throw unprocessable("type is required");
      if (!content) throw unprocessable("content is required");

      const outcome = await meetingAgentSvc.addOutcome(req.params.id, type, content, actor.actorId);
      publishLiveEvent({
        companyId: mtg.companyId,
        type: "meeting.outcome.added",
        payload: { meetingId: req.params.id, outcomeId: outcome?.id, type },
      });

      await logActivity(db, {
        companyId: mtg.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "meeting.outcome_added",
        entityType: "meeting",
        entityId: req.params.id,
        details: { type, source: "meeting" },
      });

      result = outcome;
      summary = type === "artifact" ? "Saved a canvas snapshot to the meeting" : `Recorded ${type.replace("_", " ")}`;
    } else if (action === "add_issue_comment") {
      // Attach a comment to an issue from inside the meeting — used by the
      // voice agent to persist vision-analysis findings into issue history.
      const issueId = typeof p.issueId === "string" && p.issueId ? p.issueId : (mtg.issueId ?? "");
      const body = typeof p.body === "string" ? p.body.trim() : "";
      if (!issueId) throw unprocessable("issueId is required (meeting has no linked issue)");
      if (!body) throw unprocessable("body is required");

      const existing = await issueSvc.getById(issueId);
      if (!existing || existing.companyId !== mtg.companyId) {
        throw notFound("Issue not found");
      }

      const comment = await issueSvc.addComment(issueId, body, {
        agentId: actor.agentId ?? undefined,
        userId: actor.actorType === "user" ? actor.actorId : undefined,
      });

      await logActivity(db, {
        companyId: mtg.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.comment_added",
        entityType: "issue",
        entityId: issueId,
        details: { source: "meeting" },
      });

      result = comment;
      summary = `Added a comment to ${existing.identifier}`;
    } else {
      throw unprocessable(`Unknown action: ${action}`);
    }

    // Surface the action in the live meeting transcript.
    const transcript = await meetingAgentSvc.processInteraction(req.params.id, {
      actorType: "agent",
      actorId: actor.actorId,
      text: summary,
      timestampOffset: 0,
    });
    publishLiveEvent({ companyId: mtg.companyId, type: "meeting.transcript.added", payload: { meetingId: req.params.id } });

    res.json({ result, summary, transcript });
  });

  return router;
}

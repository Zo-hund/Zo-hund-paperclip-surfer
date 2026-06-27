import { Router } from "express";
import { eq, desc, count, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { meetings, meetingTranscripts, meetingOutcomes } from "@paperclipai/db";
import { forbidden, notFound } from "../errors.js";
import { recordingService, meetingAgentService as createMeetingAgentService } from "../services/index.js";
import { publishLiveEvent } from "../services/live-events.js";
import { logger } from "../middleware/logger.js";

/**
 * AMX LABS Meetings API factory
 */
type HeartbeatService = { wakeup: (agentId: string, opts?: Record<string, unknown>) => Promise<void> };

export function meetingsRouter(db: Db, heartbeat?: HeartbeatService) {
  const router = Router();
  const meetingAgentSvc = createMeetingAgentService(db, heartbeat);

  router.get("/", async (req, res) => {
    const companyId = req.query.companyId as string;
    if (!companyId) throw forbidden("Company ID required");

    const results = await db
      .select()
      .from(meetings)
      .where(eq(meetings.companyId, companyId))
      .orderBy(desc(meetings.createdAt));

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
      };
    }));

    res.json(enriched);
  });

  router.post("/", async (req, res) => {
    const { companyId, title, type } = req.body;
    if (!companyId || !title) throw forbidden("Missing required fields");
    
    const [meeting] = await db
      .insert(meetings)
      .values({
        companyId,
        title,
        type: type ?? "standup",
        status: "active",
      })
      .returning();

    publishLiveEvent({ companyId, type: "meeting.started", payload: { meetingId: meeting.id, title } });

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
    const { actorType, actorId, text, timestampOffset } = req.body;
    
    const transcript = await meetingAgentSvc.processInteraction(req.params.id, {
      actorType,
      actorId,
      text,
      timestampOffset,
    });

    // Look up companyId for publishing
    const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
    if (mtg) publishLiveEvent({ companyId: mtg.companyId, type: "meeting.transcript.added", payload: { meetingId: req.params.id } });

    res.json(transcript);
  });

  router.post("/:id/invite", async (req, res) => {
    const { agentId } = req.body;
    const participant = await meetingAgentSvc.inviteAgent(req.params.id, agentId);

    const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, req.params.id)).limit(1);
    if (mtg) publishLiveEvent({ companyId: mtg.companyId, type: "meeting.participant.joined", payload: { meetingId: req.params.id, agentId } });

    res.json(participant);
  });

  router.get("/:id/participants", async (req, res) => {
    const participants = await meetingAgentSvc.getParticipants(req.params.id);
    res.json(participants);
  });

  router.get("/:id/outcomes", async (req, res) => {
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
    
    const stream = await recordingService.getRecordingStream(meeting.companyId, meeting.id);
    if (!stream) throw notFound("Recording not found");
    
    res.setHeader("Content-Type", "audio/webm");
    stream.pipe(res);
  });

  return router;
}

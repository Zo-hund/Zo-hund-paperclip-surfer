import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { meetings, meetingTranscripts } from "@paperclipai/db";
import { forbidden, notFound } from "../errors.js";
import { recordingService } from "../services/index.js";

/**
 * AMX LABS Meetings API factory
 */
export function meetingsRouter(db: Db) {
  const router = Router();

  router.get("/", async (req, res) => {
    const companyId = req.query.companyId as string;
    if (!companyId) throw forbidden("Company ID required");
    
    const results = await db
      .select()
      .from(meetings)
      .where(eq(meetings.companyId, companyId))
      .orderBy(desc(meetings.createdAt));
      
    res.json(results);
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
      
    res.json(meeting);
  });

  router.get("/:id", async (req, res) => {
    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, req.params.id))
      .limit(1);
      
    if (!meeting) throw notFound("Meeting not found");
    
    const transcripts = await db
      .select()
      .from(meetingTranscripts)
      .where(eq(meetingTranscripts.meetingId, meeting.id))
      .orderBy(meetingTranscripts.timestampOffset);
      
    res.json({ ...meeting, transcripts });
  });

  router.post("/:id/transcript", async (req, res) => {
    const { actorType, actorId, text, timestampOffset } = req.body;
    
    const [transcript] = await db
      .insert(meetingTranscripts)
      .values({
        meetingId: req.params.id,
        actorType,
        actorId,
        text,
        timestampOffset,
      })
      .returning();
      
    res.json(transcript);
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

import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * AMX LABS Meetings
 * Tracks real-time voice sessions (Stand-ups, Board Meets)
 */
export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    type: text("type").notNull().default("standup"), // standup, board_meet, brainstorm
    status: text("status").notNull().default("active"), // active, completed
    recordingPath: text("recording_path"),
    durationSeconds: integer("duration_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * AMX LABS Meeting Transcripts
 * Stores text segments labeled by actor for full accountability
 */
export const meetingTranscripts = pgTable(
  "meeting_transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(), // user, agent
    actorId: text("actor_id").notNull(),
    text: text("text").notNull(),
    timestampOffset: integer("timestamp_offset"), // Milliseconds from start
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

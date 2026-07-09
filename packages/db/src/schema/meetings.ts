import { pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { authUsers } from "./auth.js";
import { issues } from "./issues.js";

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
    // Set alongside durationSeconds when the meeting is finalized (createdAt
    // doubles as the start time — no separate startedAt column needed).
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // Optional: this meeting is "about" a specific issue/workorder — its
    // details auto-populate as a ModulePanel card on room entry.
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    // Best-effort external calendar sync (write-only, Google Calendar today).
    // Null when the company hasn't linked Google Workspace or the sync failed.
    calendarProvider: text("calendar_provider"),
    calendarEventId: text("calendar_event_id"),
    // Free-text label a board member sets when starting a meeting to mark it
    // as part of a recurring series (e.g. "weekly-standup"). A new meeting
    // sharing a podKey with a prior one carries forward that meeting's
    // lastActiveContext, so reopening a recurring meeting picks back up.
    podKey: text("pod_key"),
    // Narrow, service-typed as `{ issueId: string } | null` — deliberately
    // not an arbitrary blob; only the issue-context ModulePanel variant is
    // meant to survive across a pod's sessions.
    lastActiveContext: jsonb("last_active_context").$type<{ issueId: string } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyPodKeyIdx: index("meetings_company_pod_key_idx").on(table.companyId, table.podKey),
  }),
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

/**
 * AMX LABS Meeting Guest Invites
 * A reusable, time-limited magic link scoped to one meeting, letting an
 * external human with no Paperclip account join via LiveKit. Only the sha256
 * hash of the token is ever stored (never the raw token) — same convention as
 * the `invites` table. Revocation only blocks future joins; it does not tear
 * down an already-connected guest's LiveKit session.
 */
export const meetingGuestInvites = pgTable(
  "meeting_guest_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    // Admin-facing label for the link itself, e.g. "Client link for Acme Corp"
    // — distinct from the joining guest's entered display name (see below).
    guestLabel: text("guest_label"),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashUniqueIdx: uniqueIndex("meeting_guest_invites_token_hash_unique_idx").on(table.tokenHash),
    meetingIdIdx: index("meeting_guest_invites_meeting_id_idx").on(table.meetingId),
  }),
);

/**
 * AMX LABS Meeting Participants
 * Tracks which agents, staff (human board users), OR external guests are
 * active in a session. Exactly one of agentId/userId/guestInviteId is set per
 * row (app-level invariant, enforced in meetingAgentService — not a DB
 * constraint, to keep the migration additive and low-risk against existing
 * agent-only data).
 */
export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => authUsers.id, { onDelete: "cascade" }),
    guestInviteId: uuid("guest_invite_id").references(() => meetingGuestInvites.id, { onDelete: "cascade" }),
    // The joining guest's entered display name — only set on guest rows.
    guestName: text("guest_name"),
    status: text("status").notNull().default("invited"), // invited, active, thinking, responding
    lastAction: text("last_action"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

/**
 * AMX LABS Meeting Outcomes
 * Structured insights generated by agents during or after a session
 */
export const meetingOutcomes = pgTable(
  "meeting_outcomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // decision, risk, action_item, question
    content: text("content").notNull(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    status: text("status").notNull().default("unresolved"), // unresolved, resolved, locked
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

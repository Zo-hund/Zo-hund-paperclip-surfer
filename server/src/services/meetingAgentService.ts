import { eq, and, ilike, isNotNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { meetingParticipants, meetingOutcomes, meetingTranscripts, agents, meetings, agentMemories, authUsers } from "@paperclipai/db";
import { publishLiveEvent } from "./live-events.js";

type HeartbeatService = { wakeup: (agentId: string, opts?: Record<string, unknown>) => Promise<void> };

/**
 * AMX LABS Meeting Agent Service
 * Orchestrates agent participation and structured outcomes for strategic sessions.
 */
export function meetingAgentService(db: Db, heartbeat?: HeartbeatService) {
  return {
    /**
     * List all participants (agents and staff) in a meeting. Each row has
     * either agentId or userId set — left joins so both kinds are returned
     * uniformly with a `participantType` discriminator.
     */
    async getParticipants(meetingId: string) {
      const rows = await db.select({
        id: meetingParticipants.id,
        agentId: meetingParticipants.agentId,
        userId: meetingParticipants.userId,
        guestInviteId: meetingParticipants.guestInviteId,
        guestName: meetingParticipants.guestName,
        status: meetingParticipants.status,
        lastAction: meetingParticipants.lastAction,
        agentName: agents.name,
        agentRole: agents.role,
        agentTitle: agents.title,
        agentIcon: agents.icon,
        userName: authUsers.name,
      })
      .from(meetingParticipants)
      .leftJoin(agents, eq(meetingParticipants.agentId, agents.id))
      .leftJoin(authUsers, eq(meetingParticipants.userId, authUsers.id))
      .where(eq(meetingParticipants.meetingId, meetingId));

      return rows.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        userId: r.userId,
        status: r.status,
        lastAction: r.lastAction,
        participantType: r.agentId ? ("agent" as const) : r.userId ? ("staff" as const) : ("guest" as const),
        name: r.agentId ? r.agentName : r.userId ? r.userName : r.guestName,
        guestName: r.guestName ?? null,
        role: r.agentRole ?? null,
        title: r.agentTitle ?? null,
        icon: r.agentIcon ?? null,
      }));
    },

    /**
     * List all structured outcomes (Decisions, Action Items) for a meeting
     */
    async getOutcomes(meetingId: string) {
      return db.select()
        .from(meetingOutcomes)
        .where(eq(meetingOutcomes.meetingId, meetingId));
    },

    /**
     * Invite an agent to a session
     */
    async inviteAgent(meetingId: string, agentId: string) {
      // Check if already invited
      const existing = await db.select()
        .from(meetingParticipants)
        .where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.agentId, agentId)))
        .limit(1)
        .then(rows => rows[0]);

      if (existing) return existing;

      const [participant] = await db.insert(meetingParticipants).values({
        meetingId,
        agentId,
        status: "active",
        lastAction: "Joined session",
      }).returning();

      return participant;
    },

    /**
     * Invite a staff member (human board user) to a session — mirrors
     * inviteAgent but keyed on userId instead of agentId.
     */
    async inviteStaff(meetingId: string, userId: string) {
      const existing = await db.select()
        .from(meetingParticipants)
        .where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, userId)))
        .limit(1)
        .then(rows => rows[0]);

      if (existing) return existing;

      const [participant] = await db.insert(meetingParticipants).values({
        meetingId,
        userId,
        status: "active",
        lastAction: "Joined session",
      }).returning();

      return participant;
    },

    /**
     * Process a real-time interaction (chat or command)
     */
    async processInteraction(meetingId: string, input: {
      actorType: "user" | "agent";
      actorId: string;
      text: string;
      timestampOffset?: number;
    }) {
      // 1. Record the transcript entry
      const [transcript] = await db.insert(meetingTranscripts).values({
        meetingId,
        actorType: input.actorType,
        actorId: input.actorId,
        text: input.text,
        timestampOffset: input.timestampOffset ?? 0,
      }).returning();

      // 2. Command Processing (/summarize, /decide, /task, /risk)
      if (input.actorType === "user" && input.text.startsWith("/")) {
        const parts = input.text.split(" ");
        const command = parts[0].toLowerCase();

        if (command === "/summarize" || command === "/decide") {
          const outcome = await this.addOutcome(meetingId, "decision", `Decision: ${input.text.slice(command.length).trim() || "Consensus reached on strategy."}`, input.actorId);
          const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, meetingId)).limit(1);
          if (mtg) publishLiveEvent({ companyId: mtg.companyId, type: "meeting.outcome.added", payload: { meetingId, outcomeId: outcome?.id, type: "decision" } });
        } else if (command === "/task" || command === "/assign") {
          const outcome = await this.addOutcome(meetingId, "action_item", `Action Item: ${input.text.slice(command.length).trim()}`, input.actorId);
          const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, meetingId)).limit(1);
          if (mtg) publishLiveEvent({ companyId: mtg.companyId, type: "meeting.outcome.added", payload: { meetingId, outcomeId: outcome?.id, type: "action_item" } });
        } else if (command === "/risk") {
          const outcome = await this.addOutcome(meetingId, "risk", `Risk Identified: ${input.text.slice(command.length).trim()}`, input.actorId);
          const [mtg] = await db.select({ companyId: meetings.companyId }).from(meetings).where(eq(meetings.id, meetingId)).limit(1);
          if (mtg) publishLiveEvent({ companyId: mtg.companyId, type: "meeting.outcome.added", payload: { meetingId, outcomeId: outcome?.id, type: "risk" } });
        }
      }

      // 3. @mention → wake up real agents via heartbeat
      const mentionRegex = /@([\w-]+)/g;
      const mentions = [...input.text.matchAll(mentionRegex)].map(m => m[1]);

      if (mentions.length > 0 && heartbeat) {
        // Get the meeting's companyId to scope the agent lookup
        const [mtg] = await db.select({ companyId: meetings.companyId })
          .from(meetings)
          .where(eq(meetings.id, meetingId))
          .limit(1);

        if (mtg) {
          for (const mentionedName of mentions) {
            // Look up agent by name (case-insensitive) within the same company
            const [agent] = await db.select({ id: agents.id, name: agents.name })
              .from(agents)
              .where(and(
                eq(agents.companyId, mtg.companyId),
                ilike(agents.name, mentionedName),
              ))
              .limit(1);

            if (agent) {
              // Update participant status to "thinking"
              await db.update(meetingParticipants)
                .set({ status: "thinking", lastAction: `Mentioned in: "${input.text.slice(0, 80)}"`, updatedAt: new Date() })
                .where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.agentId, agent.id)));

              // Wake the agent with meeting context
              await heartbeat.wakeup(agent.id, {
                source: "on_demand",
                reason: "meeting_mention",
                payload: { meetingId, text: input.text },
                requestedByActorType: input.actorType,
                requestedByActorId: input.actorId,
              });
            }
          }
        }
      }

      return transcript;
    },

    /**
     * Add a structured outcome
     */
    async addOutcome(meetingId: string, type: string, content: string, actorId?: string) {
       let agentId: string | null = null;
       // Only query agents table if actorId looks like a UUID (avoids type errors for "Board Member" etc.)
       const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
       if (actorId && UUID_RE.test(actorId)) {
         const agent = await db.select({ id: agents.id })
           .from(agents)
           .where(eq(agents.id, actorId as any))
           .limit(1)
           .then(rows => rows[0]);
         if (agent) agentId = agent.id;
       }

       return db.insert(meetingOutcomes).values({
         meetingId,
         type,
         content,
         agentId,
         status: "unresolved",
       }).returning().then(rows => rows[0]);
    },

    async logOutcomesToMemory(meetingId: string, companyId: string) {
      const outcomes = await db.select().from(meetingOutcomes).where(eq(meetingOutcomes.meetingId, meetingId));
      if (outcomes.length === 0) return;

      // Only agent participants get memories written — staff (human)
      // participants have no memory scope to write to.
      const participants = await db.select({ agentId: meetingParticipants.agentId })
        .from(meetingParticipants)
        .where(and(eq(meetingParticipants.meetingId, meetingId), isNotNull(meetingParticipants.agentId)));

      type MemoryCategory = "pattern" | "preference" | "decision" | "learning" | "feedback";
      const CATEGORY_MAP: Record<string, MemoryCategory> = {
        decision: "decision",
        risk: "feedback",
        action_item: "pattern",
        question: "learning",
      };

      for (const outcome of outcomes) {
        const targetAgentIds = outcome.agentId
          ? [outcome.agentId]
          : participants.map((p) => p.agentId).filter((id): id is string => id !== null);

        const category: MemoryCategory = CATEGORY_MAP[outcome.type] ?? "learning";

        for (const agentId of targetAgentIds) {
          await db.insert(agentMemories).values({
            agentId,
            companyId,
            scope: "global" as const,
            category,
            title: `Meeting ${outcome.type}: ${outcome.content.slice(0, 80)}`,
            content: outcome.content,
            source: "board" as const,
            confidence: 1.0,
          });
        }
      }
    },
  };
}

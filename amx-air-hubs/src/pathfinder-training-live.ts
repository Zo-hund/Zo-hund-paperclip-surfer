import type { RealtimeChannel } from "@supabase/supabase-js";
import { getMemberDataClient } from "./member-auth";
import { competencies, setupChecks } from "./pathfinder-training";

export type LiveTrainingSession = {
  id: string; organization_id: string; session_code: string; title: string; status: "draft" | "live" | "paused" | "complete";
  facilitator_id: string; active_segment: number; running: boolean; started_at: string | null; remaining_seconds: number;
  setup: boolean[]; revision: number; updated_at: string;
};

export type LiveTrainingParticipant = {
  id: string; session_id: string; user_id: string; display_name: string; evidence: string[]; competencies: boolean[];
  certified_at: string | null; certified_by: string | null; proof_id: string | null; updated_at: string;
};

const normalizeSession = (row: LiveTrainingSession): LiveTrainingSession => ({ ...row, setup: setupChecks.map((_, index) => Boolean(row.setup?.[index])) });
const normalizeParticipant = (row: LiveTrainingParticipant): LiveTrainingParticipant => ({ ...row, evidence: competencies.map((_, index) => String(row.evidence?.[index] || "")), competencies: competencies.map((_, index) => Boolean(row.competencies?.[index])) });

export async function loadLiveTraining(organizationId: string) {
  const client = await getMemberDataClient();
  const { data, error } = await client.from("pathfinder_training_sessions").select("*").eq("organization_id", organizationId).in("status", ["draft", "live", "paused"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return { session: null, participants: [] as LiveTrainingParticipant[] };
  const roster = await client.from("pathfinder_training_participants").select("*").eq("session_id", data.id).order("joined_at");
  if (roster.error) throw roster.error;
  return { session: normalizeSession(data as LiveTrainingSession), participants: (roster.data || []).map((row) => normalizeParticipant(row as LiveTrainingParticipant)) };
}

export async function createLiveTraining(organizationId: string, userId: string) {
  const client = await getMemberDataClient();
  const sessionCode = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  const { data, error } = await client.from("pathfinder_training_sessions").insert({ organization_id: organizationId, session_code: sessionCode, facilitator_id: userId, status: "live", setup: setupChecks.map(() => false) }).select("*").single();
  if (error) throw error;
  return normalizeSession(data as LiveTrainingSession);
}

export async function updateLiveTraining(session: LiveTrainingSession, patch: Partial<LiveTrainingSession>) {
  const client = await getMemberDataClient();
  const { data, error } = await client.from("pathfinder_training_sessions").update({ ...patch, revision: session.revision + 1, updated_at: new Date().toISOString() }).eq("id", session.id).eq("revision", session.revision).select("*").single();
  if (error) throw error;
  return normalizeSession(data as LiveTrainingSession);
}

export async function joinLiveTraining(sessionId: string, userId: string, displayName: string) {
  const client = await getMemberDataClient();
  const existing = await client.from("pathfinder_training_participants").select("*").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return normalizeParticipant(existing.data as LiveTrainingParticipant);
  const { data, error } = await client.from("pathfinder_training_participants").insert({ session_id: sessionId, user_id: userId, display_name: displayName, evidence: competencies.map(() => ""), competencies: competencies.map(() => false) }).select("*").single();
  if (error) throw error;
  return normalizeParticipant(data as LiveTrainingParticipant);
}

export async function updateLiveParticipant(participant: LiveTrainingParticipant, patch: Pick<LiveTrainingParticipant, "evidence" | "competencies">) {
  const client = await getMemberDataClient();
  const { data, error } = await client.from("pathfinder_training_participants").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", participant.id).select("*").single();
  if (error) throw error;
  return normalizeParticipant(data as LiveTrainingParticipant);
}

export async function certifyLiveParticipant(participantId: string, proofId: string) {
  const client = await getMemberDataClient();
  const { data, error } = await client.rpc("certify_pathfinder_participant", { target_participant_id: participantId, target_proof_id: proofId });
  if (error) throw error;
  return normalizeParticipant(data as LiveTrainingParticipant);
}

export async function subscribeLiveTraining(sessionId: string, onChange: () => void): Promise<() => void> {
  const client = await getMemberDataClient();
  const channel: RealtimeChannel = client.channel(`pathfinder-${sessionId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "pathfinder_training_sessions", filter: `id=eq.${sessionId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "pathfinder_training_participants", filter: `session_id=eq.${sessionId}` }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

import { getMemberDataClient } from "./member-auth";

export const AMX_ROLES = ["MEMBER", "LEARNER", "BUILDER", "DEVELOPER", "FOUNDER", "WORKFORCE", "MENTOR", "INSTRUCTOR", "EMPLOYER", "PARTNER", "AIR_HUB", "STAFF", "ADMIN"] as const;
export type AmxRole = typeof AMX_ROLES[number];

export interface AmxRoleAssignment {
  id: string;
  tenant_id: string;
  user_id: string;
  role: AmxRole;
  status: "active" | "suspended" | "revoked";
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
}

export async function loadRoleAssignments(tenantId: string) {
  const client = await getMemberDataClient();
  const { data, error } = await client.from("amx_role_assignments").select("*").eq("tenant_id", tenantId).order("granted_at", { ascending: false });
  if (error) throw error;
  return (data || []) as AmxRoleAssignment[];
}

export async function assignAmxRole(tenantId: string, userId: string, role: AmxRole, reason: string) {
  const client = await getMemberDataClient();
  const { error } = await client.rpc("assign_amx_role", { target_tenant_id: tenantId, target_user_id: userId, target_role: role, grant_reason: reason });
  if (error) throw error;
}

export async function revokeAmxRole(assignmentId: string, reason: string) {
  const client = await getMemberDataClient();
  const { error } = await client.rpc("revoke_amx_role", { assignment_id: assignmentId, revoke_reason: reason });
  if (error) throw error;
}

type CreateCompanyInviteInput = {
  allowedJoinTypes?: "human" | "agent" | "both";
  targetEnvironment?: "simulation" | "live";
  defaultsPayload?: Record<string, unknown> | null;
  agentMessage?: string | null;
  inviteeEmail?: string | null;
};

export function buildCreateCompanyInviteInput(
  input: CreateCompanyInviteInput = {},
): CreateCompanyInviteInput {
  const inviteeEmail = typeof input.inviteeEmail === "string"
    ? input.inviteeEmail.trim()
    : null;

  return {
    ...(input.allowedJoinTypes ? { allowedJoinTypes: input.allowedJoinTypes } : {}),
    ...(input.targetEnvironment ? { targetEnvironment: input.targetEnvironment } : {}),
    ...(input.defaultsPayload !== undefined ? { defaultsPayload: input.defaultsPayload } : {}),
    ...(input.agentMessage !== undefined ? { agentMessage: input.agentMessage } : {}),
    ...(inviteeEmail ? { inviteeEmail } : {}),
  };
}

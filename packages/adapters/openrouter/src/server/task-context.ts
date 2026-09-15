function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Match the wake-context contract supplied by heartbeat and the local adapters. */
export function buildOpenRouterWakeEnv(context: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string | undefined> = {
    PAPERCLIP_TASK_ID: nonEmpty(context.taskId) ?? nonEmpty(context.issueId),
    PAPERCLIP_WAKE_REASON: nonEmpty(context.wakeReason),
    PAPERCLIP_WAKE_COMMENT_ID: nonEmpty(context.wakeCommentId) ?? nonEmpty(context.commentId),
    PAPERCLIP_APPROVAL_ID: nonEmpty(context.approvalId),
    PAPERCLIP_APPROVAL_STATUS: nonEmpty(context.approvalStatus),
  };
  if (Array.isArray(context.issueIds)) {
    const ids = context.issueIds.map(nonEmpty).filter((id): id is string => !!id);
    if (ids.length) values.PAPERCLIP_LINKED_ISSUE_IDS = ids.join(",");
  }
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

/** Every invocation needs fresh task instructions, even when a conversation is resumed. */
export function buildOpenRouterTaskPrompt(context: Record<string, unknown>): string {
  const hasTask = !!(nonEmpty(context.taskId) ?? nonEmpty(context.issueId));
  return [
    "This is a new Paperclip heartbeat. Re-read current assignments; previous conversation is historical, not proof that today's task is complete.",
    "Use run_command to call the Paperclip API using PAPERCLIP_API_URL from the environment. Paths below are relative to that base URL. Authenticate with PAPERCLIP_API_KEY without printing it. Include X-Paperclip-Run-Id from PAPERCLIP_RUN_ID on every mutation. Never print environment secrets or hard-code credentials.",
    "First GET /api/agents/me to verify identity and company. Respect company boundaries, task ownership, budgets, and approval requirements; API access is not permission to bypass them.",
    hasTask
      ? "The current task ID is in PAPERCLIP_TASK_ID. GET /api/issues/{issueId} and /api/issues/{issueId}/comments to read the requested deliverable and latest instructions. Do not substitute an old task from session history."
      : "GET /api/agents/me/inbox-lite and select your assigned in_progress task, then todo. If nothing is assigned and there is no explicit ownership handoff, report no assigned work and stop.",
    "If PAPERCLIP_WAKE_COMMENT_ID is set, read that comment in the current issue thread. Only take unassigned work when an explicit authorized handoff requests it. If PAPERCLIP_APPROVAL_ID is set, read GET /api/approvals/{approvalId} and /api/approvals/{approvalId}/issues before acting; a wake-up is not an approval.",
    'Before work, POST /api/issues/{issueId}/checkout with {"agentId":"<your agent id>","expectedStatuses":["todo","backlog","blocked","in_progress"]}. A 409 means another run owns it: stop without retrying or changing ownership.',
    "Produce the actual requested output and check its acceptance criteria. A local file or final chat response alone is not a Briefcase deliverable. Do not fabricate outputs, measurements, tests, or completion.",
    'For a document, PUT /api/issues/{issueId}/documents/deliverable with {"title":"<deliverable title>","format":"markdown","body":"<actual content>","changeSummary":"<what changed>"}. If updating an existing document, read it first and supply its revision as baseRevisionId. This route attempts automatic Briefcase registration, so GET /api/issues/{issueId}/work-products afterward to verify the entry exists.',
    'For another reviewable output, or if document auto-registration is missing, POST /api/issues/{issueId}/work-products with {"type":"document","provider":"agent","title":"<title>","url":"<accessible output URL>","status":"active","reviewState":"needs_board_review","isPrimary":true,"summary":"<what was produced>"}; choose the actual output type (such as pull_request or preview_url). Reuse an existing matching entry rather than duplicating it. A document export URL is /api/issues/{issueId}/documents/deliverable/export.',
    'Only after verifying the output and its Briefcase entry, PATCH /api/issues/{issueId} with {"status":"in_review","comment":"<result, evidence, and deliverable link>"}. Use done only when the task explicitly needs no board sign-off. GET the issue and work-products again to confirm persisted status and deliverable before reporting success.',
    'If blocked, PATCH your checked-out issue to {"status":"blocked","comment":"<specific blocker and who needs to act>"} when authorized and reachable. Report the failure honestly if that update fails; never claim success merely because a model turn ended.',
  ].join("\n\n");
}

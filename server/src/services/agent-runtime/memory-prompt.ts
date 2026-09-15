/** Capture is enabled only by the saved operator-owned adapter configuration. */
export function buildMemoryPrompt(input: {
  memorySection: string;
  memoryCapture?: unknown;
  verifiedProjectId?: string | null;
  experimentSection?: string;
}): string {
  const projectId = input.verifiedProjectId?.trim() || null;
  const reflection = input.memoryCapture === true
    ? [
        "# Optional memory capture enabled by the operator",
        "After the requested work, save a memory only when there is a specific useful learning. Do not invent a learning or add unrelated work. A memory failure must be reported honestly.",
        "Use the configured PAPERCLIP_API_URL environment variable and POST /api/agents/me/memories. Authenticate with PAPERCLIP_API_KEY without printing it; include X-Paperclip-Run-Id from PAPERCLIP_RUN_ID and Content-Type: application/json. Use structured JSON serialization rather than hand-escaped shell JSON.",
        JSON.stringify({
          scope: projectId ? "project" : "global",
          ...(projectId ? { projectId } : {}),
          category: "learning",
          title: "<specific learning title>",
          content: "<verified useful learning>",
          confidence: 0.8,
        }),
        projectId
          ? "Use only the verified project ID supplied above; do not substitute company, agent, or issue IDs."
          : "There is no verified project for this run. Use global scope and omit the project identifier field.",
      ].join("\n\n")
    : "";
  return input.memorySection + reflection + (input.experimentSection ?? "");
}

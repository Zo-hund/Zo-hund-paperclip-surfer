import type { Agent } from "./data";

export type AgentContentKind = "text" | "audio" | "image" | "video" | "code" | "document";
export type RuntimeTransport = "remote" | "local";

export interface AgentAttachment {
  id: string;
  kind: Exclude<AgentContentKind, "text">;
  name: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
  file?: File;
  content?: string;
  dataUrl?: string;
  storageUrl?: string;
  transfer: "inline" | "metadata" | "stored";
}

export interface AgentToolTrace {
  id: string;
  name: string;
  source: "skill" | "plugin" | "mcp" | "runtime";
  status: "queued" | "running" | "complete" | "blocked";
  detail: string;
  timestamp: string;
}

export interface AgentMessage {
  id: string;
  role: "human" | "agent" | "system";
  text: string;
  contentKind: AgentContentKind;
  attachments: AgentAttachment[];
  timestamp: string;
  transport?: RuntimeTransport;
  tools?: AgentToolTrace[];
}

export interface AgentRuntimeStatus {
  transport: RuntimeTransport;
  agentRuntimeConfigured: boolean;
  mcpGatewayConfigured: boolean;
  pluginGatewayConfigured: boolean;
  livekitConfigured: boolean;
  persistenceConfigured?: boolean;
  mediaStorageConfigured?: boolean;
  roomTransport?: "durable-object" | "supabase" | "local-only";
  deploymentMode?: "full" | "degraded" | "not-ready";
  tools: Array<{ name: string; description: string; source: AgentToolTrace["source"]; available: boolean }>;
}

export const contentCapabilities: Array<{ kind: AgentContentKind; label: string; detail: string }> = [
  { kind: "text", label: "Text", detail: "Prompts and structured responses" },
  { kind: "audio", label: "Audio", detail: "Voice capture and playback" },
  { kind: "image", label: "Images", detail: "Visual evidence and references" },
  { kind: "video", label: "Video", detail: "Clips and spatial walkthroughs" },
  { kind: "code", label: "Code", detail: "Three.js, shaders, and app code" },
  { kind: "document", label: "Files", detail: "GLB, JSON, reports, and proof" },
];

export const builtInSkills = [
  "Multimodal intake",
  "Three.js scene review",
  "WebXR safety check",
  "Mission planning",
  "Proof packaging",
  "Human escalation",
  "Spatial environment capture",
  "Semantic scene reconstruction",
  "PBR material calibration",
  "Lighting and reflection matching",
  "Geospatial anchor alignment",
  "Reality validation",
  "Tenant operations monitoring",
  "Rack thermal diagnosis",
  "Capacity and SLA planning",
  "Data-center incident facilitation",
];

const fallbackTools: AgentRuntimeStatus["tools"] = [
  { name: "system.health", description: "Inspect AMX runtime health", source: "runtime", available: true },
  { name: "mission.context", description: "Read the active mission context", source: "skill", available: true },
  { name: "proof.latest", description: "Read the latest local proof record", source: "runtime", available: true },
  { name: "spatial.capabilities", description: "Inspect browser XR and GPU support", source: "runtime", available: true },
  { name: "dcim.inspect", description: "Inspect the active tenant pod telemetry", source: "skill", available: true },
  { name: "rack.thermal-map", description: "Diagnose rack inlet temperature and airflow risk", source: "skill", available: true },
  { name: "tenant.capacity-plan", description: "Calculate tenant power and compute headroom", source: "skill", available: true },
  { name: "incident.runbook", description: "Build a guarded response plan for the active scenario", source: "skill", available: true },
  { name: "workshop.brief", description: "Generate a facilitator brief from the twin state", source: "skill", available: true },
  { name: "plugin.catalog", description: "List tools from the configured Plugin gateway", source: "plugin", available: false },
  { name: "mcp.tools", description: "List tools from the configured MCP gateway", source: "mcp", available: false },
];

async function uploadAttachment(attachment: AgentAttachment) {
  const { previewUrl: _previewUrl, file, ...transport } = attachment;
  if (!file || ["localhost", "127.0.0.1"].includes(location.hostname) || !window.__AMX_CONFIG__?.mediaStorageConfigured || file.size > 25 * 1024 * 1024) return transport;
  try {
    const response = await fetch("/api/media", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-AMX-Filename": file.name,
        "X-AMX-Tenant": localStorage.getItem("amx_active_tenant") || "tech-at-nite",
      },
      body: file,
    });
    if (!response.ok) return transport;
    const stored = await response.json() as { url?: string };
    if (!stored.url) return transport;
    return { ...transport, storageUrl: stored.url, transfer: transport.dataUrl || transport.content ? "inline" as const : "stored" as const };
  } catch {
    return transport;
  }
}

async function safeAttachments(attachments: AgentAttachment[]) {
  return Promise.all(attachments.slice(0, 12).map(uploadAttachment));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) throw new Error(`Runtime request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function getAgentRuntimeStatus(): Promise<AgentRuntimeStatus> {
  try {
    return await requestJson<AgentRuntimeStatus>("/api/agents/capabilities");
  } catch {
    return {
      transport: "local",
      agentRuntimeConfigured: false,
      mcpGatewayConfigured: false,
      pluginGatewayConfigured: false,
      livekitConfigured: false,
      tools: fallbackTools,
    };
  }
}

function localToolTraces(attachments: AgentAttachment[], contentKind: AgentContentKind): AgentToolTrace[] {
  const timestamp = new Date().toISOString();
  const names = new Set<string>(["mission.context"]);
  if (contentKind === "code" || attachments.some((item) => item.kind === "code")) names.add("scene-code.review");
  if (attachments.some((item) => item.kind === "image" || item.kind === "video")) names.add("media.intake");
  if (attachments.some((item) => item.kind === "audio")) names.add("audio.intake");
  if (attachments.some((item) => item.kind === "document")) names.add("proof.package");
  return [...names].map((name) => ({
    id: crypto.randomUUID(),
    name,
    source: name === "mission.context" || name.includes("review") || name === "proof.package" ? "skill" : "runtime",
    status: "complete",
    detail: name.includes("intake") ? "Content registered locally; remote analysis requires a configured runtime." : "Completed in the browser runtime.",
    timestamp,
  }));
}

function localReply(agent: Agent, text: string, attachments: AgentAttachment[], contentKind: AgentContentKind) {
  const kinds = [...new Set(attachments.map((item) => item.kind))];
  const received = kinds.length ? ` I registered ${attachments.length} ${kinds.join(" + ")} item${attachments.length === 1 ? "" : "s"}.` : "";
  const source = text.trim() || "the attached content";
  const focus = contentKind === "code"
    ? "I can review the scene structure, rendering path, interaction state, and deployment risk."
    : attachments.some((item) => item.kind === "image" || item.kind === "video")
      ? "The media is available for local preview; visual inference will activate when a remote multimodal runtime is connected."
      : `I mapped this to ${agent.specialty.toLowerCase()} and prepared the next executable step.`;
  return `${agent.name} received: "${source.slice(0, 180)}"${received} ${focus}`;
}

export async function sendAgentRequest(agent: Agent, text: string, attachments: AgentAttachment[], contentKind: AgentContentKind) {
  const payload = { agentId: agent.id, agentName: agent.name, tenantId: localStorage.getItem("amx_active_tenant") || "tech-at-nite", text: text.slice(0, 12_000), contentKind, attachments: await safeAttachments(attachments) };
  try {
    return await requestJson<{ text: string; transport: RuntimeTransport; tools: AgentToolTrace[] }>("/api/agents/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { text: localReply(agent, text, attachments, contentKind), transport: "local" as const, tools: localToolTraces(attachments, contentKind) };
  }
}

export async function invokeAgentTool(toolName: string, agentId: string, operationalContext: Record<string, unknown> = {}) {
  const spatialNavigator = navigator as Navigator & { gpu?: unknown; xr?: unknown };
  let latestProof: unknown;
  try { latestProof = JSON.parse(localStorage.getItem("amx_proof_vault") || "[]")[0]; } catch { latestProof = undefined; }
  try {
    return await requestJson<{ trace: AgentToolTrace; output: string }>("/api/agents/tools/invoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolName,
        agentId,
        context: {
          ...operationalContext,
          missionId: localStorage.getItem("amx_mission") || "webxr-creator",
          latestProof,
          browser: { webgpu: Boolean(spatialNavigator.gpu), webxr: Boolean(spatialNavigator.xr), camera: Boolean(navigator.mediaDevices?.getUserMedia), online: navigator.onLine },
        },
      }),
    });
  } catch {
    const tool = fallbackTools.find((item) => item.name === toolName);
    const available = tool?.available;
    const missionId = localStorage.getItem("amx_mission") || "webxr-creator";
    const pod = operationalContext.pod as { itLoadKw?: number; pue?: number; networkGbps?: number; availabilityPercent?: number } | undefined;
    const racks = Array.isArray(operationalContext.racks) ? operationalContext.racks as Array<{ label?: string; inletC?: number; capacityPercent?: number; health?: string }> : [];
    const alarms = Array.isArray(operationalContext.alarms) ? operationalContext.alarms as string[] : [];
    const localOutput = toolName === "system.health"
      ? `AMX AIR Hubs is online in the browser runtime (${navigator.onLine ? "network available" : "offline"}).`
      : toolName === "mission.context"
        ? `Active mission context: ${missionId}.`
        : toolName === "proof.latest"
          ? latestProof ? `Latest local proof: ${JSON.stringify(latestProof).slice(0, 800)}` : "No local proof record is available yet."
          : toolName === "spatial.capabilities"
            ? `Spatial capabilities: WebGPU ${spatialNavigator.gpu ? "available" : "unavailable"}, WebXR ${spatialNavigator.xr ? "available" : "unavailable"}, camera ${navigator.mediaDevices ? "available" : "unavailable"}.`
            : toolName === "dcim.inspect"
              ? `Tenant pod snapshot: ${pod?.itLoadKw ?? "unknown"} kW IT load, PUE ${pod?.pue ?? "unknown"}, ${pod?.networkGbps ?? "unknown"} Gbps, ${pod?.availabilityPercent ?? "unknown"}% availability. ${alarms.length} active alarm${alarms.length === 1 ? "" : "s"}.`
              : toolName === "rack.thermal-map"
                ? racks.length ? `Thermal map: ${racks.map((rack) => `${rack.label} ${rack.inletC} C (${rack.health})`).join(", ")}.` : "No rack telemetry was supplied."
                : toolName === "tenant.capacity-plan"
                  ? racks.length ? `Capacity plan: ${racks.map((rack) => `${rack.label} ${rack.capacityPercent}%`).join(", ")}. Preserve at least 15% rack headroom before admitting burst work.` : "No capacity telemetry was supplied."
                  : toolName === "incident.runbook"
                    ? `${alarms.length ? `Prioritize: ${alarms.join("; ")}.` : "No active alarms."} Keep physical actuation locked, validate impact, simulate the change, request operator approval, then verify recovery.`
                    : toolName === "workshop.brief"
                      ? `Workshop brief: inspect tenant context, identify the highest-risk rack, run one what-if scenario, use an agent tool for evidence, and document the human approval decision.`
            : `${toolName} completed locally.`;
    return {
      trace: {
        id: crypto.randomUUID(), name: toolName, source: tool?.source || "runtime",
        status: available ? "complete" as const : "blocked" as const,
        detail: available ? "Executed in the local toolbelt." : "Connect the MCP gateway to execute this tool.", timestamp: new Date().toISOString(),
      },
      output: available ? localOutput : `${toolName} is not connected.`,
    };
  }
}

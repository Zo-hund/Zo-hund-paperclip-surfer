import { useCallback, useEffect, useState } from "react";
import { Activity, Database, HardDriveUpload, Radio, RefreshCw, ServerCog, ShieldCheck, Wrench } from "lucide-react";
import { PageHeader, StatusPill } from "../components";

type RuntimeReadiness = {
  ready: boolean;
  mode: "full" | "degraded" | "not-ready";
  required: string[];
  missingRequired: string[];
  optionalMissing: string[];
  components: Record<string, boolean>;
  roomTransport: "durable-object" | "supabase" | "local-only";
  deploymentTier?: "staging" | "production";
  service: string;
  version: string;
  requestId: string;
  timestamp: string;
};

const componentLabels: Record<string, { label: string; detail: string }> = {
  database: { label: "D1 database", detail: "Proof, analytics, and agent-run metadata" },
  media: { label: "R2 media", detail: "Images, audio, video, code, and files" },
  realtime: { label: "Realtime", detail: "Supabase room messaging and presence" },
  rooms: { label: "Room transport", detail: "Durable Object or Supabase fan-out" },
  agent: { label: "Agent runtime", detail: "Remote multimodal inference endpoint" },
  mcp: { label: "MCP gateway", detail: "Allowlisted external tool execution" },
  plugins: { label: "Plugin gateway", detail: "Server-side plugin execution" },
  livekit: { label: "LiveKit", detail: "Multi-user camera and room audio" },
  runway: { label: "Runway avatars", detail: "Realtime generative avatar sessions" },
  "proof-signing": { label: "Proof signing", detail: "Server-side HMAC attestation" },
  telemetry: { label: "DCIM telemetry", detail: "Authenticated physical-system data ingestion" },
  observability: { label: "Operations alerts", detail: "Production incident notification and heartbeat" },
};

const componentIcons: Record<string, typeof Activity> = {
  database: Database,
  media: HardDriveUpload,
  realtime: Radio,
  rooms: Radio,
  agent: Activity,
  mcp: ServerCog,
  plugins: Wrench,
  "proof-signing": ShieldCheck,
  livekit: Radio,
  runway: Activity,
  telemetry: Activity,
  observability: ShieldCheck,
};

function localReadiness(): RuntimeReadiness {
  const config = window.__AMX_CONFIG__;
  return {
    ready: true,
    mode: "degraded",
    required: [],
    missingRequired: [],
    optionalMissing: ["database", "media", "realtime", "rooms", "agent", "mcp", "plugins", "livekit", "runway", "proof-signing", "telemetry", "observability"],
    components: {
      database: Boolean(config?.persistenceConfigured),
      media: Boolean(config?.mediaStorageConfigured),
      realtime: Boolean(config?.supabaseUrl && config.supabasePublishableKey),
      rooms: Boolean(config?.roomTransport && config.roomTransport !== "local-only"),
      agent: false,
      mcp: false,
      plugins: false,
      livekit: Boolean(config?.livekitConfigured),
      runway: false,
      "proof-signing": false,
      telemetry: false,
      observability: false,
    },
    roomTransport: config?.roomTransport || "local-only",
    service: "amx-air-hubs",
    version: config?.version || "local",
    requestId: "browser-preview",
    timestamp: new Date().toISOString(),
  };
}

export function RuntimeStatusPage() {
  const [status, setStatus] = useState<RuntimeReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ready", { headers: { Accept: "application/json" } });
      const contentType = response.headers.get("Content-Type") || "";
      if (!contentType.includes("application/json")) throw new Error("Worker readiness endpoint is unavailable in this preview");
      const result = await response.json() as RuntimeReadiness;
      setStatus(result);
      if (!response.ok) setError(result.missingRequired.length ? `Missing required services: ${result.missingRequired.join(", ")}` : "Runtime is not ready");
    } catch (reason) {
      setStatus(localReadiness());
      setError(reason instanceof Error ? reason.message : "Runtime status could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const mode = status?.mode || "degraded";
  return <div className="page runtime-status-page">
    <div className="section-wrap"><PageHeader eyebrow="OPERATIONS / RUNTIME" title="Production status" description="Deployment readiness, durable services, and external integration state." actions={<button type="button" className="icon-button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh runtime status" title="Refresh runtime status"><RefreshCw/></button>}/></div>
    <section className="runtime-status-band"><div className="section-wrap"><div><span className="eyebrow">READINESS</span><b>{loading ? "CHECKING" : status?.requestId === "browser-preview" ? "LOCAL PREVIEW" : status?.ready ? "READY" : "ACTION REQUIRED"}</b></div><StatusPill tone={mode === "full" ? "green" : mode === "not-ready" ? "gold" : "cyan"}>{mode}</StatusPill><span>{status?.deploymentTier || "staging"} / {status?.roomTransport || "checking"}</span><span>VERSION / {status?.version || "checking"}</span></div></section>
    <div className="section-wrap">
      {error ? <div className="runtime-status-notice"><Activity/><span>{error}</span></div> : null}
      <section className="runtime-component-grid" aria-live="polite">{Object.entries(status?.components || {}).map(([name, configured]) => {
        const Icon = componentIcons[name] || Activity;
        const copy = componentLabels[name] || { label: name, detail: "Runtime component" };
        const required = status?.required.includes(name);
        return <article className={configured ? "configured" : required ? "required" : "optional"} key={name}><Icon/><div><span>{required ? "REQUIRED" : "OPTIONAL"}</span><h2>{copy.label}</h2><p>{copy.detail}</p></div><StatusPill tone={configured ? "green" : required ? "gold" : "cyan"}>{configured ? "connected" : required ? "missing" : "setup"}</StatusPill></article>;
      })}</section>
      <footer className="runtime-request-meta"><span>REQUEST / {status?.requestId || "pending"}</span><time>{status?.timestamp ? new Date(status.timestamp).toLocaleString() : ""}</time></footer>
    </div>
  </div>;
}

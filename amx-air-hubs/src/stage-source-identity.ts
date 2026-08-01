export type StageSourceKind = "phone" | "camera" | "webxr" | "screen" | "pod" | "room" | "agent" | "encoder";

export interface StageSourceIdentity {
  label: string;
  location: string;
  organization: string;
  role: string;
  kind: StageSourceKind;
}

const kinds = new Set<StageSourceKind>(["phone", "camera", "webxr", "screen", "pod", "room", "agent", "encoder"]);
const bounded = (value: unknown, fallback: string, max = 64) => String(value || fallback).replace(/[<>]/g, "").trim().slice(0, max) || fallback;

export function stageSourceIdentity(metadata: string | undefined, fallbackName: string, source: "camera" | "screen"): StageSourceIdentity {
  let value: Record<string, unknown> = {};
  try { value = JSON.parse(metadata || "{}") as Record<string, unknown>; } catch { value = {}; }
  const requestedKind = String(value.sourceKind || value.kind || source).toLowerCase() as StageSourceKind;
  return {
    label: bounded(value.sourceLabel || value.label, fallbackName, 80),
    location: bounded(value.location, "REMOTE", 80),
    organization: bounded(value.organization || value.org, "AMX NETWORK", 80),
    role: bounded(value.productionRole || value.role, source === "screen" ? "CONTENT" : "CONTRIBUTOR", 40),
    kind: source === "screen" ? "screen" : kinds.has(requestedKind) ? requestedKind : "camera",
  };
}

export function stageSourceHealth(input: { muted: boolean; width?: number; height?: number; frameRate?: number }) {
  if (input.muted) return "offline" as const;
  if ((input.width || 0) < 640 || (input.height || 0) < 360 || (input.frameRate || 0) < 20) return "degraded" as const;
  return "ready" as const;
}

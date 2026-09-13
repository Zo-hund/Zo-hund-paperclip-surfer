export type VisionSource = "world" | "pod" | "external";

export const VISION_TOOLS = [
  { id: "mission.context", label: "Mission context" },
  { id: "dcim.inspect", label: "Inspect data-center twin" },
  { id: "rack.thermal-map", label: "Review thermal map" },
  { id: "incident.runbook", label: "Open incident runbook" },
] as const;

export function clampVisionCadence(value: number) {
  return Math.min(60, Math.max(5, Math.round(value)));
}

export function isQuestBrowser(userAgent: string) {
  return /OculusBrowser|Quest/i.test(userAgent);
}

export function visionCameraNote(userAgent: string, externalReady: boolean) {
  if (externalReady) return "Browser camera ready. Frames remain consent gated.";
  if (isQuestBrowser(userAgent)) return "Quest passthrough is compositor-only. Connect a browser-visible UVC camera or use World capture.";
  return "Open a browser-visible camera to analyze an external view.";
}

export function visionOperatorId(profileId?: string | null) {
  if (profileId) return profileId;
  const saved = sessionStorage.getItem("amx_vision_operator");
  if (saved) return saved;
  const id = `guest-${crypto.randomUUID().slice(0, 8)}`;
  sessionStorage.setItem("amx_vision_operator", id);
  return id;
}

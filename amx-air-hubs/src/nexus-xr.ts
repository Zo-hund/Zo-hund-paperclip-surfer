import type { ExperienceMode } from "./immersive";

export type NexusXRMode = "none" | "vr" | "mr";

export function normalizeNexusXRMode(value: unknown): NexusXRMode {
  return value === "vr" || value === "mr" ? value : "none";
}

export function nexusSpatialRoute(requested: "ar" | "vr" | "mr", resolved: ExperienceMode) {
  if (requested === "vr" && resolved === "vr") return "/nexus?xr=vr";
  if ((requested === "ar" || requested === "mr") && (resolved === "ar" || resolved === "mr")) return "/nexus?xr=mr";
  return "/nexus";
}

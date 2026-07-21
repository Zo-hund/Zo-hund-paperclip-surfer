export type NexusVfxPreset = "off" | "ambient" | "show";
export type NexusGlobeLevel = "low" | "center" | "high";

export const NEXUS_GLOBE_LEVELS: Record<NexusGlobeLevel, { label: string; offset: number }> = {
  low: { label: "Low", offset: -1.35 },
  center: { label: "Center", offset: 0 },
  high: { label: "High", offset: 1.2 },
};

export const NEXUS_VFX_PARTICLES = { ambient: 220, show: 520 } as const;

export function normalizeNexusVfxPreset(value: unknown): NexusVfxPreset {
  return value === "off" || value === "show" ? value : "ambient";
}

export function normalizeNexusGlobeLevel(value: unknown): NexusGlobeLevel {
  return value === "low" || value === "high" ? value : "center";
}

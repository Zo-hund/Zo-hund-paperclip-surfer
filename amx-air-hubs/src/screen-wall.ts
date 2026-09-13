export type ScreenLayoutMode = "triple" | "wall";
export type ScreenWallFit = "contain" | "cover";
export type ScreenWallFormat = "production" | "cinema" | "panorama";

export const SCREEN_WALL_FORMATS: Record<ScreenWallFormat, { label: string; ratio: string; resolution: string; aspect: number }> = {
  production: { label: "Production", ratio: "16:9", resolution: "3840 x 2160", aspect: 16 / 9 },
  cinema: { label: "Cinema", ratio: "21:9", resolution: "3840 x 1646", aspect: 21 / 9 },
  panorama: { label: "Panorama", ratio: "32:9", resolution: "3840 x 1080", aspect: 32 / 9 },
};

function normalizeCastRoom(value: string, fallback = "AMXSTAGE") {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || fallback;
}

export function normalizeScreenLayoutMode(value: unknown): ScreenLayoutMode {
  return value === "wall" ? "wall" : "triple";
}

export function normalizeScreenWallFit(value: unknown): ScreenWallFit {
  return value === "cover" ? "cover" : "contain";
}

export function normalizeScreenWallFormat(value: unknown): ScreenWallFormat {
  return value === "cinema" || value === "panorama" ? value : "production";
}

export function screenWallCastHref(room: string) {
  const params = new URLSearchParams({ display: "wall", source: "nexus" });
  return `/watch/${encodeURIComponent(normalizeCastRoom(room))}?${params.toString()}`;
}

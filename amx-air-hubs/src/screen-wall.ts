export type ScreenLayoutMode = "triple" | "wall";
export type ScreenWallFit = "contain" | "cover";

function normalizeCastRoom(value: string, fallback = "AMXSTAGE") {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24) || fallback;
}

export function normalizeScreenLayoutMode(value: unknown): ScreenLayoutMode {
  return value === "wall" ? "wall" : "triple";
}

export function normalizeScreenWallFit(value: unknown): ScreenWallFit {
  return value === "cover" ? "cover" : "contain";
}

export function screenWallCastHref(room: string) {
  const params = new URLSearchParams({ display: "wall", source: "nexus" });
  return `/watch/${encodeURIComponent(normalizeCastRoom(room))}?${params.toString()}`;
}

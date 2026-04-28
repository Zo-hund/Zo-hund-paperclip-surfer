/**
 * AMX neon/tech color palette for per-agent identity branding.
 * Each agent gets a deterministic color based on a hash of its ID.
 */
const AMX_PALETTE = [
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#3b82f6", // blue
  "#f97316", // orange
  "#a855f7", // purple
  "#14b8a6", // teal
  "#ef4444", // red
  "#84cc16", // lime
  "#e879f9", // fuchsia
];

/**
 * Returns a consistent hex color for a given agent ID.
 * The same ID always maps to the same color.
 */
export function agentColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AMX_PALETTE[hash % AMX_PALETTE.length]!;
}

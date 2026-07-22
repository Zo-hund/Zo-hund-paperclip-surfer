export type MetaverseMode = "solo" | "co-op" | "teams";
export type MetaverseEventType = "showcase" | "summit" | "conference" | "expo";
export type WorldPrimitive = "box" | "sphere" | "cylinder" | "torus";

export interface WorldEntity {
  id: string;
  name: string;
  primitive: WorldPrimitive;
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
}

export interface WorldBlueprint {
  title: string;
  environment: "studio" | "grid" | "space";
  entities: WorldEntity[];
}

export interface MetaverseDeliverable {
  id: string;
  title: string;
  code: string;
  revision: number;
  updatedAt: number;
  updatedBy: string;
}

export interface MetaverseSessionState {
  mode: MetaverseMode;
  eventType: MetaverseEventType;
  organizationId: string;
  organizationName: string;
  organizationTags: string[];
  teamName: string;
  status: "lobby" | "building" | "review" | "showcase-ready";
  deliverable: MetaverseDeliverable;
}

export const DEFAULT_WORLD_BLUEPRINT: WorldBlueprint = {
  title: "AMX Co-Creation Pod",
  environment: "studio",
  entities: [
    { id: "core", name: "Agent Core", primitive: "sphere", color: "#55e6ff", position: [0, 1.2, -2.4], scale: [0.72, 0.72, 0.72] },
    { id: "plinth", name: "Deliverable Plinth", primitive: "cylinder", color: "#202f39", position: [0, 0.28, -2.4], scale: [1.3, 0.28, 1.3] },
    { id: "team-a", name: "Team Node A", primitive: "box", color: "#f4c96b", position: [-1.8, 0.7, -3.2], scale: [0.7, 0.7, 0.7] },
    { id: "team-b", name: "Team Node B", primitive: "box", color: "#ff63de", position: [1.8, 0.7, -3.2], scale: [0.7, 0.7, 0.7] },
  ],
};

export function worldBlueprintCode(blueprint: WorldBlueprint = DEFAULT_WORLD_BLUEPRINT) {
  return JSON.stringify(blueprint, null, 2);
}

function text(value: unknown, fallback: string, maximum: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : fallback;
}

function numberTuple(value: unknown, fallback: [number, number, number], maximum: number): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  return value.map((item, index) => Number.isFinite(Number(item)) ? Math.max(-maximum, Math.min(maximum, Number(item))) : fallback[index]) as [number, number, number];
}

export function parseWorldBlueprint(code: string): { blueprint: WorldBlueprint | null; error: string } {
  if (!code.trim()) return { blueprint: null, error: "Add a world blueprint before previewing." };
  if (code.length > 10_000) return { blueprint: null, error: "World blueprints are limited to 10 KB for realtime room delivery." };
  try {
    const value = JSON.parse(code) as Partial<WorldBlueprint>;
    if (!Array.isArray(value.entities)) return { blueprint: null, error: "Blueprint must include an entities array." };
    const entities = value.entities.slice(0, 48).map((candidate, index) => {
      const entity = candidate as Partial<WorldEntity>;
      const primitive: WorldPrimitive = ["box", "sphere", "cylinder", "torus"].includes(String(entity.primitive)) ? entity.primitive as WorldPrimitive : "box";
      const color = /^#[0-9a-f]{6}$/i.test(String(entity.color)) ? String(entity.color) : "#55e6ff";
      return {
        id: text(entity.id, `entity-${index + 1}`, 64),
        name: text(entity.name, `Entity ${index + 1}`, 80),
        primitive,
        color,
        position: numberTuple(entity.position, [0, 0.5, -2], 20),
        scale: numberTuple(entity.scale, [1, 1, 1], 8).map((item) => Math.max(0.05, Math.abs(item))) as [number, number, number],
      } satisfies WorldEntity;
    });
    const environment = ["studio", "grid", "space"].includes(String(value.environment)) ? value.environment as WorldBlueprint["environment"] : "studio";
    return { blueprint: { title: text(value.title, "Untitled world", 100), environment, entities }, error: "" };
  } catch (error) {
    return { blueprint: null, error: error instanceof Error ? error.message : "Blueprint JSON is invalid." };
  }
}

export function normalizeOrganizationTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean))].slice(0, 8);
}

export function defaultMetaverseSession(organizationId: string, organizationName: string): MetaverseSessionState {
  const now = Date.now();
  return {
    mode: "solo",
    eventType: "showcase",
    organizationId,
    organizationName,
    organizationTags: [organizationId, "webxr", "threejs"],
    teamName: "AMX Builders",
    status: "lobby",
    deliverable: { id: crypto.randomUUID(), title: "AMX Co-Creation Pod", code: worldBlueprintCode(), revision: now, updatedAt: now, updatedBy: "local" },
  };
}

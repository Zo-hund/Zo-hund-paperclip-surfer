export type SimulationSkillId = "capture" | "reconstruct" | "materials" | "lighting" | "anchors" | "validate";

export interface SimulationSkill {
  id: SimulationSkillId;
  label: string;
  detail: string;
  output: string;
}

export interface SimulationSkillRun {
  id: string;
  skillId: SimulationSkillId;
  status: "complete";
  confidence: number;
  artifacts: string[];
  summary: string;
  createdAt: string;
}

export const simulationSkills: SimulationSkill[] = [
  { id: "capture", label: "Spatial capture", detail: "Register LiDAR, depth, video, and reference dimensions.", output: "capture manifest" },
  { id: "reconstruct", label: "Scene reconstruction", detail: "Build a metric mesh with semantic prop boundaries.", output: "reconstruction mesh" },
  { id: "materials", label: "PBR calibration", detail: "Resolve albedo, normal, roughness, and metalness maps.", output: "PBR material set" },
  { id: "lighting", label: "Light matching", detail: "Estimate exposure, color temperature, and practical lights.", output: "lighting rig" },
  { id: "anchors", label: "Anchor alignment", detail: "Align the reconstruction to shared real-world coordinates.", output: "anchor graph" },
  { id: "validate", label: "Reality validation", detail: "Compare scale, silhouettes, light, and material response.", output: "validation report" },
];

const artifacts: Record<SimulationSkillId, string[]> = {
  capture: ["capture.json", "reference-frames", "scale-markers"],
  reconstruct: ["environment.glb", "semantic-props.json", "collision-mesh.glb"],
  materials: ["basecolor.png", "normal.png", "roughness.png", "metalness.png"],
  lighting: ["light-probes.json", "exposure-profile.json", "reflection-probe.hdr"],
  anchors: ["anchor-graph.json", "world-transform.json"],
  validate: ["visual-diff.json", "scale-audit.json", "release-report.md"],
};

export async function runSimulationSkill(skillId: SimulationSkillId, roomCode: string): Promise<SimulationSkillRun> {
  const skill = simulationSkills.find((item) => item.id === skillId) || simulationSkills[0];
  await new Promise((resolve) => setTimeout(resolve, 420));
  const confidence = skillId === "capture" ? 92 : skillId === "validate" ? 89 : 94;
  const run: SimulationSkillRun = {
    id: crypto.randomUUID(),
    skillId,
    status: "complete",
    confidence,
    artifacts: artifacts[skillId],
    summary: `${skill.label} completed for room ${roomCode}. ${skill.output} is ready for governed review.`,
    createdAt: new Date().toISOString(),
  };
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) {
    void fetch("/api/twins/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: run.id, twinId: "facility-cell-01", roomCode, eventType: "skill", payload: run, createdAt: run.createdAt }),
    }).catch(() => undefined);
  }
  return run;
}

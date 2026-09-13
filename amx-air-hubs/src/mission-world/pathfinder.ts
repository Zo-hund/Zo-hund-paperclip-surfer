import { MISSION_WORLDS } from "./catalog";
import type { MissionWorldId, MissionWorldProgress } from "./types";

export type PathfinderGroup = "Explorer" | "Builder" | "Ambassador";
export type CollectibleTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Onyx";

export interface PathfinderCollectible {
  id: string;
  name: string;
  missionId?: MissionWorldId;
  tier: CollectibleTier;
  unlocked: boolean;
  credentialId?: string;
  skill: string;
  physicalFormat: string;
  color: string;
  proofRoute: string;
}

export interface ReadinessRequirement {
  id: string;
  label: string;
  complete: boolean;
  evidence: string;
}

const bounded = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const completedLessons = (progress: MissionWorldProgress) => MISSION_WORLDS.reduce((total, world) => total + (progress.lessons[world.id]?.length || 0), 0);
const approvedRecords = (progress: MissionWorldProgress) => MISSION_WORLDS.map((world) => progress.simulations[world.id]).filter((record) => record?.approved && record.lastResult?.deploymentEligible);
const safeCredentialPart = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

export function pathfinderPillars(progress: MissionWorldProgress) {
  const approved = approvedRecords(progress);
  const averageScore = approved.length ? approved.reduce((total, record) => total + (record?.bestScore || 0), 0) / approved.length : 0;
  const roles = new Set(approved.map((record) => record?.configuration.role).filter(Boolean));
  const safetyPasses = approved.filter((record) => !record?.lastResult?.criticalFailures.length).length;
  const plans = approved.filter((record) => (record?.configuration.plan.trim().split(/\s+/).length || 0) >= 12).length;
  const know = bounded(completedLessons(progress) / 30 * 100);
  const doScore = bounded(approved.length / 5 * 70 + averageScore * .3);
  const be = bounded(roles.size / 5 * 35 + safetyPasses / 5 * 35 + (progress.mode === "teams" ? 30 : progress.mode === "co-op" ? 20 : 8));
  return {
    training: { know, do: doScore, be },
    zkode: {
      create: bounded(doScore * .8 + approved.length / 5 * 20),
      curate: bounded(completedLessons(progress) / 30 * 45 + plans / 5 * 35 + progress.badges.length / 7 * 20),
      connect: bounded((progress.mode === "teams" ? 50 : progress.mode === "co-op" ? 35 : 10) + roles.size / 5 * 25 + approved.length / 5 * 25),
    },
  };
}

export function pathfinderGroup(progress: MissionWorldProgress): { current: PathfinderGroup; next: PathfinderGroup | null; progress: number; reason: string } {
  const approved = approvedRecords(progress);
  const averageScore = approved.length ? approved.reduce((total, record) => total + (record?.bestScore || 0), 0) / approved.length : 0;
  const know = pathfinderPillars(progress).training.know;
  if (progress.completed.length === 5 && averageScore >= 85 && progress.mode === "teams") return { current: "Ambassador", next: null, progress: 100, reason: "Core missions mastered with team deployment evidence." };
  if (approved.length >= 2 && know >= 50) return { current: "Builder", next: "Ambassador", progress: bounded((progress.completed.length / 5 * 55) + (averageScore / 100 * 25) + (progress.mode === "teams" ? 20 : 0)), reason: "Apply skills through all five missions, team leadership, and an 85+ average." };
  return { current: "Explorer", next: "Builder", progress: bounded((know / 100 * 45) + (approved.length / 2 * 55)), reason: "Complete half the learning path and two approved simulations." };
}

const collectibleNames: Record<MissionWorldId, { name: string; skill: string; format: string }> = {
  ai: { name: "AI Apprentice Neural Coin", skill: "Responsible AI operations", format: "Challenge coin" },
  xr: { name: "Reality Shifter XR Portal Coin", skill: "Accessible spatial computing", format: "Portal keychain" },
  robotics: { name: "Robot Wrangler Gear Coin", skill: "Safe robotics control", format: "Gear coin" },
  automation: { name: "Flow Architect Automation Coin", skill: "Governed workflow automation", format: "Lanyard charm" },
  builder: { name: "World Builder Cube Coin", skill: "Safe XR world publishing", format: "Desk badge" },
};

export function pathfinderCollectibles(progress: MissionWorldProgress): PathfinderCollectible[] {
  const group = pathfinderGroup(progress).current;
  const missionCollectibles: PathfinderCollectible[] = MISSION_WORLDS.map((world) => {
    const record = progress.simulations[world.id];
    const lessonsReady = (progress.lessons[world.id]?.length || 0) === world.lessons.length;
    const approved = Boolean(record?.approved && record.lastResult?.deploymentEligible);
    const tier: CollectibleTier = approved && (record?.bestScore || 0) >= 85 ? "Gold" : approved ? "Silver" : "Bronze";
    const unlocked = lessonsReady || approved;
    const credentialId = approved ? `XRT-${safeCredentialPart(world.id)}-${record?.bestScore || 0}` : undefined;
    const detail = collectibleNames[world.id];
    return { id: `${world.id}-coin`, name: detail.name, missionId: world.id, tier, unlocked, credentialId, skill: detail.skill, physicalFormat: detail.format, color: world.color, proofRoute: credentialId ? `/proof/${credentialId}` : "/missions/world" };
  });
  const mastery = progress.completed.length === 5;
  const masterCredentialId = mastery ? `XRT-MASTER-${progress.xp}` : undefined;
  missionCollectibles.push({ id: "mission-master-star", name: "Mission Master Star Coin", tier: mastery && group === "Ambassador" ? "Platinum" : "Gold", unlocked: mastery, credentialId: masterCredentialId, skill: "Cross-domain mission delivery", physicalFormat: "Mini trophy", color: "#f4c96b", proofRoute: masterCredentialId ? `/proof/${masterCredentialId}` : "/missions/world" });
  missionCollectibles.push({ id: "orchestrator-onyx", name: "Human-Agentic Orchestrator Coin", tier: "Onyx", unlocked: false, skill: "Multi-agent workforce orchestration", physicalFormat: "NFC metal coin", color: "#d7e5e8", proofRoute: "/missions" });
  return missionCollectibles;
}

export function deploymentReadiness(progress: MissionWorldProgress): { score: number; ready: boolean; requirements: ReadinessRequirement[] } {
  const ai = progress.simulations.ai;
  const requirements: ReadinessRequirement[] = [
    { id: "ai", label: "AI 101 approved", complete: progress.completed.includes("ai"), evidence: "Community support agent proof" },
    { id: "xr", label: "XR safety approved", complete: progress.completed.includes("xr"), evidence: "Career expo accessibility proof" },
    { id: "automation", label: "Automation basics approved", complete: progress.completed.includes("automation"), evidence: "Event workflow proof" },
    { id: "hardware", label: "Hardware and spatial setup", complete: progress.completed.includes("robotics") && progress.completed.includes("builder"), evidence: "Robot and world-builder proofs" },
    { id: "privacy", label: "Data privacy control demonstrated", complete: Boolean(ai?.configuration.safeguardIds.includes("privacy") && ai.approved), evidence: "PII redaction configuration" },
    { id: "communication", label: "Professional communication", complete: Object.values(progress.simulations).some((record) => (record?.configuration.plan.trim().split(/\s+/).length || 0) >= 12), evidence: "Documented solution plan" },
    { id: "industry", label: "Industry simulation completed", complete: progress.completed.length >= 1, evidence: "Approved client simulation" },
    { id: "workshop", label: "Supervised workshop delivered", complete: false, evidence: "Trainer workshop record required" },
    { id: "trainer", label: "Trainer approval", complete: progress.completed.length === 5, evidence: "Five Pit Stop approvals" },
    { id: "opprrc", label: "OPPRRC evidence available", complete: progress.completed.length > 0, evidence: "Proof Wallet record" },
  ];
  const score = bounded(requirements.filter((item) => item.complete).length / requirements.length * 100);
  return { score, ready: requirements.every((item) => item.complete), requirements };
}

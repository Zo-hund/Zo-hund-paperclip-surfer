export type TrainingPillar = "KNOW" | "DO" | "BE";

export type TrainingSegment = {
  id: string; pillar: TrainingPillar; start: string; end: string; minutes: number; title: string; outcome: string;
};

export const trainingSegments: TrainingSegment[] = [
  { id: "welcome", pillar: "KNOW", start: "9:00", end: "9:15", minutes: 15, title: "Welcome + three pillars", outcome: "Name the KNOW / DO / BE progression." },
  { id: "ai", pillar: "KNOW", start: "9:15", end: "9:30", minutes: 15, title: "AI fundamentals", outcome: "Explain safe educator uses for planning, differentiation, and checks." },
  { id: "xr", pillar: "KNOW", start: "9:30", end: "9:45", minutes: 15, title: "XR overview", outcome: "Distinguish VR, AR, and MR with safety guardrails." },
  { id: "integration", pillar: "KNOW", start: "9:45", end: "10:00", minutes: 15, title: "Integration triangle", outcome: "Connect a STEM topic to a reading anchor and math check." },
  { id: "ai-build", pillar: "DO", start: "10:00", end: "10:15", minutes: 15, title: "AI lesson build", outcome: "Draft a three-day AI-assisted mini-unit." },
  { id: "xr-demo", pillar: "DO", start: "10:15", end: "10:30", minutes: 15, title: "Quest experience", outcome: "Run a supervised five-minute headset rotation and debrief." },
  { id: "project", pillar: "DO", start: "10:30", end: "10:45", minutes: 15, title: "Mini-project", outcome: "Design a 30-minute integrated learner activity." },
  { id: "share", pillar: "DO", start: "10:45", end: "11:00", minutes: 15, title: "Share-out", outcome: "Deliver a 90-second pitch and receive one strength + bump-up." },
  { id: "identity", pillar: "BE", start: "11:00", end: "11:20", minutes: 20, title: "Educator identity", outcome: "Reflect on becoming a steward of builders." },
  { id: "teachback", pillar: "BE", start: "11:20", end: "11:40", minutes: 20, title: "Practice teach-back", outcome: "Teach one Pathfinder concept for five minutes." },
  { id: "qa", pillar: "BE", start: "11:40", end: "11:50", minutes: 10, title: "Q&A + pathways", outcome: "Name support channels and a real-world next step." },
  { id: "certify", pillar: "BE", start: "11:50", end: "12:00", minutes: 10, title: "Certification + closing", outcome: "Commit, certify, and record completion." },
];

export const competencies = [
  "Explain AI, VR, AR, and MR", "Draft a three-day AI-assisted lesson", "Supervise a Quest XR experience",
  "Design a STEM / Reading / Math activity", "Deliver a five-minute teach-back", "Write an Ambassador reflection", "Receive completion certification",
];

export const setupChecks = ["Venue layout and quiet XR corner", "Wi-Fi and learner logins", "Quest headsets charged and cleaned", "Projector, audio, and screen share", "Handouts and certificates staged", "Refreshments, water, and partner resources", "Trainer huddle and backup plan"];
export const contingencyPlans = [
  { title: "Wi-Fi fails", action: "Use the recorded AI demo, paper prototype, and guided XR observer flow." },
  { title: "Quest unavailable", action: "Use the browser WebXR demo; Reading and Math remain the instructional spine." },
  { title: "One trainer absent", action: "Defer one share-out, remove ambient media, and protect the teach-back block." },
  { title: "Learner needs a reset", action: "Offer the quiet corner, a five-minute pause, and a written teach-back option." },
];

export type PathfinderProgram = {
  id: string; name: string; venue: string; schedule: string; learnerTarget: number;
  evidenceStarters: string[]; setup: boolean[];
};

export const evidenceStarters = [
  "I can explain AI, VR, AR, and MR using this classroom example: ",
  "My three-day AI-assisted lesson helps learners to: ",
  "During supervised Quest practice, I observed this safety and access need: ",
  "My STEM, Reading, and Math activity connects the subjects by: ",
  "My teach-back focused on this Pathfinder concept and feedback: ",
  "As a Pathfinder Ambassador, I will apply this work by: ",
  "Trainer verification notes: ",
];

export const pathfinderPrograms: PathfinderProgram[] = [
  { id: "educator-core", name: "Educator Core / 3 Hours", venue: "Classroom or community lab", schedule: "9:00 AM - 12:00 PM", learnerTarget: 12, evidenceStarters, setup: setupChecks.map(() => false) },
  { id: "staff-intensive", name: "Staff Intensive / 90 Minutes", venue: "Staff development room", schedule: "90-minute intensive", learnerTarget: 20, evidenceStarters: evidenceStarters.map((item) => `Rapid deployment: ${item}`), setup: setupChecks.map((_, index) => index < 4) },
  { id: "mobile-pop-up", name: "Mobile Pop-Up / Event", venue: "Expo, summit, or mobile lab", schedule: "Drop-in rotations", learnerTarget: 30, evidenceStarters: evidenceStarters.map((item) => `Mobile activation: ${item}`), setup: setupChecks.map((_, index) => [0, 1, 2, 4].includes(index)) },
];

export function parsePathfinderProgram(value: string): PathfinderProgram {
  const parsed = JSON.parse(value) as Partial<PathfinderProgram>;
  if (!parsed.name || !Array.isArray(parsed.evidenceStarters) || parsed.evidenceStarters.length !== competencies.length) throw new Error("Program JSON must include a name and seven evidence starters.");
  return {
    id: String(parsed.id || parsed.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64),
    name: String(parsed.name).slice(0, 100), venue: String(parsed.venue || "Flexible venue").slice(0, 120),
    schedule: String(parsed.schedule || "Custom schedule").slice(0, 80), learnerTarget: Math.max(1, Math.min(500, Number(parsed.learnerTarget) || 12)),
    evidenceStarters: parsed.evidenceStarters.map((item) => String(item).slice(0, 500)),
    setup: setupChecks.map((_, index) => Boolean(parsed.setup?.[index])),
  };
}

export type PathfinderTrainingState = {
  activeSegment: number; running: boolean; startedAt: number | null; remainingSeconds: number;
  setup: boolean[]; learners: string[]; evidence: string[]; competencies: boolean[][]; certified: boolean[];
};

export const TRAINING_STORAGE_KEY = "amx_pathfinder_training_aug_7_2026";
export const emptyTrainingState = (): PathfinderTrainingState => ({ activeSegment: 0, running: false, startedAt: null, remainingSeconds: trainingSegments[0].minutes * 60, setup: setupChecks.map(() => false), learners: ["Staff learner 1", "Staff learner 2", "Staff learner 3"], evidence: ["", "", "", "", "", "", ""], competencies: Array.from({ length: 3 }, () => competencies.map(() => false)), certified: [false, false, false] });

export function readTrainingState(): PathfinderTrainingState {
  try { return { ...emptyTrainingState(), ...JSON.parse(localStorage.getItem(TRAINING_STORAGE_KEY) || "{}") }; } catch { return emptyTrainingState(); }
}
export function saveTrainingState(state: PathfinderTrainingState) { localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(state)); }
export function learnerProgress(state: PathfinderTrainingState, learnerIndex = 0) { return state.competencies[learnerIndex].filter(Boolean).length; }
export function sessionProgress(state: PathfinderTrainingState) { return state.competencies.flat().filter(Boolean).length; }

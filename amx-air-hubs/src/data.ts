export type Role = "Learner" | "Earner" | "Trainer" | "Sponsor" | "Admin";
export type RunStage = "pre" | "pro" | "post";
export type AccessType = "free" | "paid" | "sponsored" | "member" | "trainer" | "cohort";

export interface Agent {
  id: string;
  name: string;
  role: string;
  specialty: string;
  voice: string;
  color: string;
  accent: string;
  missions: string[];
  unlockAtXP: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

export interface MissionStep {
  id: string;
  title: string;
  body: string;
  prompt: string;
  xp: number;
}

export interface Mission {
  id: string;
  title: string;
  domain: string;
  description: string;
  agentId: string;
  duration: string;
  difficulty: string;
  badge: string;
  xp: number;
  roles: Role[];
  access: { type: AccessType; sponsorId?: string; price: number; paymentRequired: boolean; x402Enabled: boolean };
  objective: string;
  steps: MissionStep[];
  quiz: QuizQuestion;
  published: boolean;
  color: string;
}

export const roles: Array<{id: Role; title: string; description: string; cta: string}> = [
  { id: "Learner", title: "Learn and certify", description: "Guided missions, quizzes, badges, and certificates.", cta: "Start training" },
  { id: "Earner", title: "Build and earn", description: "Sponsored missions, XP rewards, and paid opportunities.", cta: "Find missions" },
  { id: "Trainer", title: "Guide a cohort", description: "Launch pods, review progress, and approve proof.", cta: "Open trainer mode" },
  { id: "Sponsor", title: "Fund an outcome", description: "Preview activation, reach, conversion, and ROI.", cta: "View sponsor deck" },
  { id: "Admin", title: "Operate the runway", description: "Publish missions, govern proof, agents, and tenants.", cta: "Open mission control" },
];

export const roleExperienceMap: Record<Role, string[]> = {
  Learner: ["training", "badge", "certificate"],
  Earner: ["training", "reward", "marketplace"],
  Trainer: ["groupLaunch", "review", "approve"],
  Sponsor: ["demo", "roi", "sponsorCTA"],
  Admin: ["missionBuilder", "proofReview", "tenantTools"],
};

export const agents: Agent[] = [
  { id: "jaz", name: "JAZ", role: "Education Guide", specialty: "Learning, quizzes, and skill proof", voice: "Friendly teacher", color: "#55e6ff", accent: "#dffbff", missions: ["xrt-green-mode", "student-onboarding"], unlockAtXP: 0 },
  { id: "taz", name: "TAZ", role: "Project Manager", specialty: "Scope, schedule, checklists, and delivery", voice: "Operations coach", color: "#f4c96b", accent: "#fff4c7", missions: ["project-checklist", "skill-pod-pilot"], unlockAtXP: 100 },
  { id: "raz", name: "RAZ", role: "Business Guide", specialty: "Sponsors, pricing, marketplace, and sales", voice: "Business coach", color: "#ff7a66", accent: "#ffe3dd", missions: ["sponsor-demo", "marketplace-preview"], unlockAtXP: 250 },
  { id: "naz", name: "NAZ", role: "Creative Host", specialty: "Stories, media missions, and creative quests", voice: "Creative host", color: "#79eea8", accent: "#e2ffed", missions: ["story-mode", "webxr-creator"], unlockAtXP: 400 },
  { id: "zohund", name: "ZOHUND", role: "AMX Host", specialty: "Welcome, orchestration, and mission closeout", voice: "Runway host", color: "#ffffff", accent: "#f4c96b", missions: ["xrt-green-mode", "sponsor-demo", "skill-pod-pilot"], unlockAtXP: 650 },
];

export const missions: Mission[] = [
  {
    id: "xrt-green-mode", title: "XRT Green Mode", domain: "WebXR Foundations",
    description: "Place JAZ in your space, learn the safe AR launch pattern, and capture your first verified mission proof.",
    agentId: "jaz", duration: "7 min", difficulty: "Starter", badge: "XRT Green Mode", xp: 130,
    roles: ["Learner", "Earner", "Trainer"], access: { type: "sponsored", sponsorId: "amx-labs", price: 0, paymentRequired: false, x402Enabled: false },
    objective: "Launch a safe WebAR session and complete the Pre / Pro / Post run lifecycle.",
    steps: [
      { id: "place", title: "Place your agent", body: "Scan the floor and tap a clear area to place JAZ.", prompt: "Keep two arm lengths of clear space around you.", xp: 20 },
      { id: "inspect", title: "Inspect the learning station", body: "Move around JAZ and identify the cyan checkpoint beacon.", prompt: "What makes a good AR placement surface?", xp: 25 },
      { id: "verify", title: "Capture mission proof", body: "Confirm the station is stable and log your final checkpoint.", prompt: "Select complete to create your OPPRRC record.", xp: 50 },
    ], quiz: { question: "What should you confirm before placing an AR agent?", options: ["A clear, safe space", "Maximum screen brightness", "A public account"], correct: 0 }, published: true, color: "#55e6ff"
  },
  {
    id: "project-checklist", title: "Project Checklist", domain: "Project Operations",
    description: "Use TAZ to turn a rough idea into an executable scope, owner map, and pre-run checklist.",
    agentId: "taz", duration: "12 min", difficulty: "Builder", badge: "Skill Pod Pilot", xp: 160,
    roles: ["Earner", "Trainer", "Admin"], access: { type: "free", price: 0, paymentRequired: false, x402Enabled: false },
    objective: "Create a mission-ready project plan with clear ownership and proof requirements.",
    steps: [
      { id: "scope", title: "Frame the outcome", body: "Name the result, audience, and completion signal.", prompt: "State the outcome in one sentence.", xp: 25 },
      { id: "sequence", title: "Sequence the run", body: "Arrange the work into Pre, Pro, and Post stages.", prompt: "Confirm each stage has one owner.", xp: 25 },
      { id: "ready", title: "Run readiness check", body: "Resolve blockers and approve the launch checklist.", prompt: "TAZ is ready to issue your pilot badge.", xp: 50 },
    ], quiz: { question: "What makes a project checkpoint verifiable?", options: ["A clear completion signal", "A longer meeting", "More participants"], correct: 0 }, published: true, color: "#f4c96b"
  },
  {
    id: "sponsor-demo", title: "Sponsor Activation", domain: "Growth and ROI",
    description: "Walk through a branded mission activation and model reach, completion cost, and marketplace conversion.",
    agentId: "raz", duration: "9 min", difficulty: "Preview", badge: "Sponsor Demo Complete", xp: 120,
    roles: ["Sponsor", "Admin", "Trainer"], access: { type: "sponsored", sponsorId: "demo-sponsor", price: 0, paymentRequired: false, x402Enabled: false },
    objective: "Understand how one sponsor campaign turns scans into verified learner outcomes.",
    steps: [
      { id: "campaign", title: "Set the campaign", body: "Choose audience, mission, cohort size, and sponsor placement.", prompt: "Modeling a 100 learner activation.", xp: 20 },
      { id: "experience", title: "Preview the experience", body: "Inspect branded agent guidance and the sponsored badge.", prompt: "Sponsor messaging stays clean and optional.", xp: 25 },
      { id: "roi", title: "Read the outcome", body: "Review completions, certificates, and cost per verified result.", prompt: "Your activation brief is ready.", xp: 50 },
    ], quiz: { question: "Which sponsor metric proves a learning outcome?", options: ["Logo impressions", "Verified completions", "Poster size"], correct: 1 }, published: true, color: "#ff7a66"
  },
  {
    id: "webxr-creator", title: "WebXR Creator Lab", domain: "Creative Technology",
    description: "Prototype an AR story beat with NAZ, then package it as a reusable mission station.",
    agentId: "naz", duration: "18 min", difficulty: "Creator", badge: "WebXR Creator", xp: 210,
    roles: ["Learner", "Earner", "Trainer"], access: { type: "member", price: 0, paymentRequired: false, x402Enabled: false },
    objective: "Create and validate a small interactive spatial story.",
    steps: [
      { id: "world", title: "Build the world", body: "Choose a place, character, and one meaningful object.", prompt: "Keep the first scene readable in five seconds.", xp: 25 },
      { id: "interaction", title: "Add interaction", body: "Create one tap, movement, or voice-triggered response.", prompt: "The interaction should teach or reveal something.", xp: 35 },
      { id: "publish", title: "Package the station", body: "Name the checkpoint and publish its proof criteria.", prompt: "Your creator badge is ready for review.", xp: 50 },
    ], quiz: { question: "A useful spatial interaction should do what?", options: ["Teach or reveal something", "Use every sensor", "Last at least ten minutes"], correct: 0 }, published: true, color: "#79eea8"
  }
];

export const runStages = {
  pre: { title: "Pre Run", required: ["role", "mission", "objective"] },
  pro: { title: "Pro Run", required: ["agentPlaced", "stepsCompleted"] },
  post: { title: "Post Run", required: ["badgeIssued", "proofSaved"] },
};

export const xpRules = { startMission: 10, placeAgent: 20, checkpoint: 25, finishMission: 50, bonusQuiz: 25, shareCertificate: 10 };

export const voiceScripts: Record<string, { intro: string; placeAgent: string; complete: string }> = {
  jaz: { intro: "Welcome to AMX AIR Hubs. I am JAZ, your education guide.", placeAgent: "Tap the floor to place me in your space.", complete: "Mission complete. Your XRT Green Mode badge is ready." },
  taz: { intro: "TAZ online. Let us turn the objective into a clean run plan.", placeAgent: "Place me near your project station.", complete: "Run approved. Your project proof is ready." },
  raz: { intro: "RAZ here. Let us connect this mission to measurable value.", placeAgent: "Place the activation panel where your team can inspect it.", complete: "Activation modeled. Your sponsor report is ready." },
  naz: { intro: "NAZ online. Let us make a small world worth exploring.", placeAgent: "Place me where the story should begin.", complete: "Scene complete. Your creator proof is ready." },
  zohund: { intro: "Welcome to the AMX runway.", placeAgent: "Choose a safe launch point.", complete: "The run is closed and the next door is open." },
};

export const tenantConfig = {
  id: "tech-at-nite", name: "Tech At Nite", defaultMission: "xrt-green-mode",
  enabledAgents: ["jaz", "taz", "raz", "naz", "zohund"],
  enabledFeatures: ["badges", "opprrc", "marketplace", "sponsorLayer"],
};

export const tenants = [
  { id: "tech-at-nite", name: "Tech At Nite", type: "Operator", color: "#55e6ff", missionIds: missions.map((mission) => mission.id), agentIds: ["jaz", "taz", "raz", "naz", "zohund"] },
  { id: "amx-labs", name: "AMX Labs", type: "Innovation Lab", color: "#f4c96b", missionIds: ["xrt-green-mode", "webxr-creator"], agentIds: ["jaz", "naz", "zohund"] },
  { id: "northside-school", name: "Northside School", type: "Education Partner", color: "#79eea8", missionIds: ["xrt-green-mode", "project-checklist"], agentIds: ["jaz", "taz"] },
  { id: "community-runway", name: "Community Runway", type: "Community Partner", color: "#ff7a66", missionIds: ["xrt-green-mode", "sponsor-demo"], agentIds: ["jaz", "raz"] },
  { id: "h3at-solutions", name: "H3AT Solutions", type: "Workforce & Innovation Partner", color: "#1bb5a7", missionIds: missions.map((mission) => mission.id), agentIds: ["jaz", "taz", "raz", "naz", "zohund"] },
];

export const sponsorConfig = {
  enabled: true, sponsorName: "AMX Labs", cta: "Sponsor this mission", campaignId: "amx-runway-001",
  metrics: { scans: 1284, starts: 946, completions: 812, certificates: 784, costPerCompletion: 18.42, learnerReach: 2210, marketplaceConversions: 196 },
};

export const marketplaceOffers = [
  { id: "next", title: "Take the next mission", type: "Mission", detail: "Continue your runway with Project Checklist.", cta: "View missions" },
  { id: "cohort", title: "Join a Skill Pod", type: "Cohort", detail: "Train alongside a small team with a live guide.", cta: "Find a pod" },
  { id: "workshop", title: "Book a WebXR workshop", type: "Workshop", detail: "Build a custom spatial mission with AMX Labs.", cta: "View workshop" },
  { id: "trainer", title: "Become a trainer", type: "Credential", detail: "Learn to launch groups and approve proof.", cta: "Start pathway" },
  { id: "sponsor", title: "Sponsor a badge", type: "Activation", detail: "Fund verified outcomes for a local cohort.", cta: "Model activation" },
  { id: "agent", title: "Hire an AMX agent", type: "Agent", detail: "Deploy a mission guide into your workflow.", cta: "Browse agents" },
];

export const podTypes = [
  { id: "solo", title: "Solo Pod", seats: 1, detail: "Self-paced guided mission." },
  { id: "co-op", title: "Co-op Pod", seats: 4, detail: "Small team with shared XP." },
  { id: "teams", title: "Teams Pod", seats: 30, detail: "Trainer-led cohort experience." },
  { id: "sponsor", title: "Sponsor Pod", seats: 50, detail: "Branded activation and outcome report." },
];

export const arAssets = {
  agents: { jaz: "/models/jaz-agent.glb", taz: "/models/taz-agent.glb", raz: "/models/raz-agent.glb", naz: "/models/naz-agent.glb" },
  badges: { greenMode: "/badges/xrt-green-mode.glb" },
  stations: { preRun: "/models/pre-run-station.glb", proRun: "/models/pro-run-station.glb", postRun: "/models/post-run-station.glb" },
};

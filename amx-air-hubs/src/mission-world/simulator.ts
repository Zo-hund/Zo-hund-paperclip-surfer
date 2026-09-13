import type { MissionWorldId, MissionWorldMode } from "./types";

export type ProfessionalRole = "Creative" | "Designer" | "Developer" | "Engineer" | "Project Manager" | "AI Operator" | "XR Technician" | "Robotics Technician" | "Automation Specialist" | "Safety Reviewer";
export type ScoreDimension = "outcomeQuality" | "technicalAccuracy" | "safety" | "efficiency" | "creativity" | "teamwork" | "evidenceQuality";

export interface SimulatorTool {
  id: string;
  label: string;
  cost: number;
  minutes: number;
  purpose: string;
}

export interface SimulatorSafeguard {
  id: string;
  label: string;
  cost: number;
  minutes: number;
  critical: boolean;
}

export interface SimulatorEvent {
  id: string;
  label: string;
  detail: string;
  responseTool?: string;
  responseSafeguard?: string;
}

export interface SimulatorScenario {
  id: MissionWorldId;
  client: string;
  need: string;
  requiredOutcome: string;
  budget: number;
  timeLimit: number;
  roles: ProfessionalRole[];
  tools: SimulatorTool[];
  safeguards: SimulatorSafeguard[];
  requiredTools: string[];
  successMeasures: string[];
  events: SimulatorEvent[];
}

export interface SimulationConfiguration {
  role: ProfessionalRole | "";
  toolIds: string[];
  safeguardIds: string[];
  plan: string;
}

export interface SimulationScores extends Record<ScoreDimension, number> {}

export interface SimulationResult {
  run: number;
  score: number;
  level: "Mastered" | "Mission accomplished" | "Completed with improvements needed" | "Partial completion" | "Run another simulation";
  scores: SimulationScores;
  spent: number;
  minutes: number;
  event: SimulatorEvent;
  eventHandled: boolean;
  criticalFailures: string[];
  consequences: string[];
  strengths: string[];
  deploymentEligible: boolean;
}

const tool = (id: string, label: string, cost: number, minutes: number, purpose: string): SimulatorTool => ({ id, label, cost, minutes, purpose });
const safeguard = (id: string, label: string, cost: number, minutes: number, critical = false): SimulatorSafeguard => ({ id, label, cost, minutes, critical });

export const SIMULATOR_SCENARIOS: Record<MissionWorldId, SimulatorScenario> = {
  ai: {
    id: "ai", client: "Northside Community Network", budget: 90, timeLimit: 75,
    need: "A nonprofit receives hundreds of questions about programs and needs support without exposing participant data.",
    requiredOutcome: "Configure, test, and approve a support agent that answers from trusted information and escalates uncertainty.",
    roles: ["AI Operator", "Developer", "Safety Reviewer", "Project Manager"],
    tools: [tool("prompt", "Prompt Builder", 10, 10, "Define role, boundaries, and output"), tool("knowledge", "Approved Knowledge Base", 22, 15, "Ground answers in organization data"), tool("confidence", "Confidence Meter", 14, 10, "Detect uncertain answers"), tool("transcript", "Test Transcript", 8, 12, "Exercise diverse user questions"), tool("api", "Program API", 25, 18, "Read current program availability")],
    safeguards: [safeguard("privacy", "PII Redaction", 12, 8, true), safeguard("escalation", "Human Escalation", 10, 8, true), safeguard("source", "Source Disclosure", 5, 4)],
    requiredTools: ["prompt", "knowledge", "confidence", "transcript"],
    successMeasures: ["Accurate grounded answers", "Correct escalation", "No sensitive-data exposure", "Fast response"],
    events: [{ id: "hallucination", label: "Unsupported answer", detail: "The agent invents an application deadline.", responseTool: "confidence" }, { id: "private-data", label: "Sensitive question", detail: "A user includes a medical detail in chat.", responseSafeguard: "privacy" }],
  },
  xr: {
    id: "xr", client: "Regional Career Collaborative", budget: 130, timeLimit: 110,
    need: "Build an accessible XR career expo for 120 learners using mixed headsets and mobility needs.",
    requiredOutcome: "Publish a navigable expo with career stations, guides, accessible routes, and stable headset performance.",
    roles: ["Creative", "Designer", "XR Technician", "Engineer", "Safety Reviewer"],
    tools: [tool("floorplan", "Floor Plan Builder", 18, 18, "Lay out visitor zones"), tool("stations", "Career Station Kit", 30, 22, "Place learning stations"), tool("guides", "AI Guide NPC", 24, 18, "Guide learner journeys"), tool("teleport", "Teleport Network", 16, 14, "Provide low-motion navigation"), tool("profiler", "Performance Profiler", 20, 15, "Measure frame budget")],
    safeguards: [safeguard("accessibility", "Accessibility Inspection", 12, 10, true), safeguard("capacity", "Zone Capacity Limits", 8, 7, true), safeguard("comfort", "Comfort Mode", 6, 5)],
    requiredTools: ["floorplan", "stations", "teleport", "profiler"],
    successMeasures: ["Stable frame rate", "Accessible text and audio", "No overcrowded zones", "Completed learner journey"],
    events: [{ id: "crowding", label: "Arrival surge", detail: "Forty learners enter the same station zone.", responseSafeguard: "capacity" }, { id: "low-fps", label: "Headset slowdown", detail: "A lower-power headset drops below the frame target.", responseTool: "profiler" }],
  },
  robotics: {
    id: "robotics", client: "East Hall Community Center", budget: 115, timeLimit: 90,
    need: "Program a robot to carry supplies through a busy community center without collisions.",
    requiredOutcome: "Complete the delivery with obstacle avoidance, efficient energy use, emergency stop, and manual recovery.",
    roles: ["Robotics Technician", "Engineer", "Developer", "Safety Reviewer", "Project Manager"],
    tools: [tool("scanner", "Sensor Scanner", 18, 12, "Inspect distance and floor sensors"), tool("route", "Route Planner", 20, 16, "Create safe navigation paths"), tool("controller", "Robot Controller", 25, 18, "Program Sense, Plan, Act logic"), tool("battery", "Battery Monitor", 12, 8, "Track energy reserve"), tool("replay", "Performance Replay", 10, 10, "Review route decisions")],
    safeguards: [safeguard("estop", "Emergency Stop", 15, 8, true), safeguard("zones", "Human Safety Zones", 10, 8, true), safeguard("override", "Manual Override", 8, 6)],
    requiredTools: ["scanner", "route", "controller", "battery"],
    successMeasures: ["Delivery completed", "No collisions", "Energy efficient", "Correct emergency response"],
    events: [{ id: "sensor-fail", label: "Sensor failure", detail: "The front distance sensor stops reporting.", responseSafeguard: "estop" }, { id: "blocked-route", label: "Route blocked", detail: "A rolling cart blocks the planned corridor.", responseTool: "route" }],
  },
  automation: {
    id: "automation", client: "AMX XR Event Operations", budget: 105, timeLimit: 85,
    need: "Automate registration, reminders, attendance, rewards, and reporting for a 120-seat AI-XR event.",
    requiredOutcome: "Process registrations without duplicates or overbooking, handle accommodations, and produce a complete report.",
    roles: ["Automation Specialist", "Developer", "Project Manager", "Safety Reviewer", "Engineer"],
    tools: [tool("trigger", "Registration Trigger", 8, 7, "Start the workflow"), tool("validator", "Data Validator", 14, 10, "Check participant records"), tool("capacity", "Seat Counter", 12, 9, "Prevent overbooking"), tool("messaging", "Message Connector", 20, 12, "Send confirmations and reminders"), tool("dashboard", "Attendance Dashboard", 18, 14, "Record outcomes"), tool("rewards", "Reward Issuer", 15, 10, "Issue verified XP and badges")],
    safeguards: [safeguard("dedupe", "Duplicate Guard", 8, 6, true), safeguard("approval", "Accommodation Approval", 7, 6, true), safeguard("retry", "Retry and Error Queue", 10, 8)],
    requiredTools: ["trigger", "validator", "capacity", "messaging", "dashboard"],
    successMeasures: ["No duplicate records", "No overbooking", "Successful delivery", "Complete attendance report"],
    events: [{ id: "over-capacity", label: "Attendance spike", detail: "Registrations exceed the venue capacity.", responseTool: "capacity" }, { id: "api-limit", label: "Message API limit", detail: "The messaging provider rejects a burst of reminders.", responseSafeguard: "retry" }],
  },
  builder: {
    id: "builder", client: "Neighborhood Learning Lab", budget: 125, timeLimit: 105,
    need: "Transform a real multipurpose room into a safe AR/MR pop-up learning hub.",
    requiredOutcome: "Publish an accessible layout with safe boundaries, useful stations, portals, and clear learner flow.",
    roles: ["Designer", "XR Technician", "Creative", "Engineer", "Safety Reviewer"],
    tools: [tool("scan", "Room Scanner", 20, 16, "Capture room geometry"), tool("objects", "3D Object Builder", 18, 18, "Create learning stations"), tool("transform", "Transform Tool", 10, 12, "Move, rotate, and scale"), tool("portals", "WebXR Portal", 20, 14, "Connect mission zones"), tool("traffic", "Traffic Flow Test", 14, 12, "Simulate learner movement")],
    safeguards: [safeguard("boundary", "Safe Boundary", 12, 8, true), safeguard("collision", "Collision Inspection", 10, 8, true), safeguard("permissions", "Publish Permissions", 6, 5)],
    requiredTools: ["scan", "objects", "transform", "traffic"],
    successMeasures: ["Safe layout", "Clear movement paths", "Accessible interactions", "Within equipment budget"],
    events: [{ id: "room-change", label: "Room layout changed", detail: "A physical table is moved into a learner path.", responseTool: "scan" }, { id: "flow-conflict", label: "Traffic conflict", detail: "Two station queues cross an emergency route.", responseTool: "traffic" }],
  },
};

export const EMPTY_SIMULATION_CONFIGURATION: SimulationConfiguration = { role: "", toolIds: [], safeguardIds: [], plan: "" };

const ratio = (selected: string[], required: string[]) => required.length ? required.filter((id) => selected.includes(id)).length / required.length : 1;
const bounded = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function performanceLevel(score: number): SimulationResult["level"] {
  if (score >= 90) return "Mastered";
  if (score >= 80) return "Mission accomplished";
  if (score >= 70) return "Completed with improvements needed";
  if (score >= 60) return "Partial completion";
  return "Run another simulation";
}

export function runMissionSimulation(scenario: SimulatorScenario, configuration: SimulationConfiguration, mode: MissionWorldMode, run: number): SimulationResult {
  const tools = scenario.tools.filter((entry) => configuration.toolIds.includes(entry.id));
  const safeguards = scenario.safeguards.filter((entry) => configuration.safeguardIds.includes(entry.id));
  const spent = [...tools, ...safeguards].reduce((total, entry) => total + entry.cost, 0);
  const minutes = [...tools, ...safeguards].reduce((total, entry) => total + entry.minutes, 0);
  const requiredCoverage = ratio(configuration.toolIds, scenario.requiredTools);
  const safetyCoverage = ratio(configuration.safeguardIds, scenario.safeguards.map((entry) => entry.id));
  const planWords = configuration.plan.trim().split(/\s+/).filter(Boolean).length;
  const planQuality = Math.min(1, planWords / 24);
  const event = scenario.events[(Math.max(1, run) - 1) % scenario.events.length];
  const eventHandled = (!event.responseTool || configuration.toolIds.includes(event.responseTool)) && (!event.responseSafeguard || configuration.safeguardIds.includes(event.responseSafeguard));
  const criticalFailures = scenario.safeguards.filter((entry) => entry.critical && !configuration.safeguardIds.includes(entry.id)).map((entry) => `${entry.label} is missing`);
  if (!configuration.role) criticalFailures.push("A responsible professional role is not assigned");
  if (spent > scenario.budget) criticalFailures.push(`Budget exceeded by ${spent - scenario.budget} credits`);

  const efficiencyPenalty = Math.max(0, spent - scenario.budget) * 2 + Math.max(0, minutes - scenario.timeLimit) * 1.5;
  const scores: SimulationScores = {
    outcomeQuality: bounded(25 + requiredCoverage * 55 + planQuality * 10 + (eventHandled ? 10 : 0)),
    technicalAccuracy: bounded(25 + requiredCoverage * 65 + safetyCoverage * 10),
    safety: bounded(15 + safetyCoverage * 75 + (eventHandled ? 10 : 0) - criticalFailures.length * 22),
    efficiency: bounded(100 - efficiencyPenalty - Math.max(0, tools.length - scenario.requiredTools.length - 1) * 5),
    creativity: bounded(35 + planQuality * 35 + Math.min(30, Math.max(0, tools.length - scenario.requiredTools.length) * 15)),
    teamwork: bounded(mode === "teams" ? 92 : mode === "co-op" ? 78 : configuration.role ? 62 : 20),
    evidenceQuality: bounded(25 + planQuality * 45 + (run > 1 ? 20 : 10) + (eventHandled ? 10 : 0)),
  };
  const score = bounded(scores.outcomeQuality * .30 + scores.technicalAccuracy * .20 + scores.safety * .15 + scores.efficiency * .10 + scores.creativity * .10 + scores.teamwork * .10 + scores.evidenceQuality * .05);
  const consequences: string[] = [];
  const strengths: string[] = [];
  if (!eventHandled) consequences.push(`${event.label}: ${event.detail} The configured system could not recover.`);
  if (requiredCoverage < 1) consequences.push(`${scenario.requiredTools.length - scenario.requiredTools.filter((id) => configuration.toolIds.includes(id)).length} required capability gaps reduced outcome quality.`);
  if (spent > scenario.budget) consequences.push(`The solution exceeded the ${scenario.budget}-credit client budget.`);
  if (minutes > scenario.timeLimit) consequences.push(`The build exceeded the ${scenario.timeLimit}-minute delivery window.`);
  criticalFailures.forEach((failure) => consequences.push(`Deployment blocked: ${failure}.`));
  if (requiredCoverage === 1) strengths.push("All required technical capabilities were configured.");
  if (eventHandled) strengths.push(`${event.label} was contained by the selected controls.`);
  if (!criticalFailures.length) strengths.push("The safety and governance gate is clear for human review.");
  return { run, score, level: performanceLevel(score), scores, spent, minutes, event, eventHandled, criticalFailures, consequences, strengths, deploymentEligible: score >= 70 && criticalFailures.length === 0 && requiredCoverage === 1 && eventHandled };
}

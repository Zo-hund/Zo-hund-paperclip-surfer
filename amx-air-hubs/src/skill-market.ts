export type EarnerMode = "solo" | "co-op" | "team" | "family" | "collective" | "elective" | "community";

export interface MarketRun {
  id: string;
  label: string;
  window: string;
  startHour: number;
  period: "day" | "night";
}

export interface EarnerLevel {
  id: number;
  name: string;
  rate: number;
  responsibilities: string[];
  advancement: string[];
}

export const marketRuns: MarketRun[] = [
  { id: "event-1", label: "Event 1", window: "9:00 AM - 12:00 PM", startHour: 9, period: "day" },
  { id: "event-2", label: "Event 2", window: "1:00 PM - 4:00 PM", startHour: 13, period: "day" },
  { id: "event-3", label: "Event 3", window: "5:00 PM - 8:00 PM", startHour: 17, period: "night" },
  { id: "event-4", label: "Event 4", window: "9:00 PM - 12:00 AM", startHour: 21, period: "night" },
];

export const earnerLevels: EarnerLevel[] = [
  { id: 1, name: "XRT Green Mode", rate: 15, responsibilities: ["Digital foundations", "Event support", "Device setup", "Customer intake", "Data collection", "Community outreach", "Guided simulations"], advancement: ["Foundational certification", "Attendance and reliability", "Approved solo simulation", "Supervisor evaluation"] },
  { id: 2, name: "XRT DevOps", rate: 25, responsibilities: ["Technical support", "Platform administration", "Digital navigation", "Customer onboarding", "Workflow execution", "Basic automation", "Co-op project delivery"], advancement: ["Technical certification", "Successful co-op simulation", "Completed live assignments", "Verified performance record"] },
  { id: 3, name: "XRT Builder / Specialist", rate: 50, responsibilities: ["Software and automation", "Creative production", "Data reporting", "Cybersecurity support", "Project execution", "Client deliverables", "Team production"], advancement: ["Specialist credential", "Portfolio verification", "Employer or client approval", "Successful team project"] },
  { id: 4, name: "XRT Lead / Engineer", rate: 75, responsibilities: ["Team supervision", "Technical architecture", "Quality assurance", "Project management", "Client communication", "Risk and compliance", "Builder mentorship"], advancement: ["Leadership certification", "Successful project leadership", "Budget accountability", "Client satisfaction targets"] },
  { id: 5, name: "XRT Ambassador / Principal", rate: 100, responsibilities: ["Collective leadership", "Employer development", "Contract negotiation", "Market activation", "Senior technical review", "Partnership management", "Placement development"], advancement: ["Principal review", "Contracted opportunity creation", "Senior delivery record", "Community impact verification"] },
];

export const workloadSchedules = [
  { id: "starter", name: "Starter", events: 1, hours: 3, purpose: "Training, simulation, first placement" },
  { id: "part-time", name: "Part-time", events: 2, hours: 6, purpose: "Paid apprenticeship or flexible work" },
  { id: "full-shift", name: "Full shift", events: 3, hours: 9, purpose: "Established placement" },
  { id: "extended", name: "Extended production day", events: 4, hours: 12, purpose: "Special events or rotating teams only" },
] as const;

export const balancedTeam = [
  { level: 1, count: 3 },
  { level: 2, count: 3 },
  { level: 3, count: 2 },
  { level: 4, count: 1 },
  { level: 5, count: 1 },
];

export const placementTargets = [
  { year: 1, placements: 1000, cumulative: 1000 },
  { year: 2, placements: 1500, cumulative: 2500 },
  { year: 3, placements: 2000, cumulative: 4500 },
  { year: 4, placements: 2500, cumulative: 7000 },
  { year: 5, placements: 3000, cumulative: 10000 },
];

export const modes: EarnerMode[] = ["solo", "co-op", "team", "family", "collective", "elective", "community"];

export function eventPay(level: EarnerLevel) { return level.rate * 3; }
export function dailyCapacity(level: EarnerLevel) { return eventPay(level) * 4; }
export function weeklyCapacity(level: EarnerLevel) { return dailyCapacity(level) * 5; }
export function balancedTeamCost() {
  return balancedTeam.reduce((total, item) => total + earnerLevels[item.level - 1].rate * item.count * 3, 0);
}

export function fundingPlan(contractValue: number) {
  const wages = balancedTeamCost();
  const administration = Math.round(wages * .2);
  const technology = 300;
  const community = 178;
  const reserve = 300;
  const committed = wages + administration + technology + community + reserve;
  return { wages, administration, technology, community, reserve, growth: Math.max(0, contractValue - committed), minimum: 2200, funded: contractValue >= 2200 };
}

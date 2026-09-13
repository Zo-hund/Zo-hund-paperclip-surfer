export type StageWorkflowPhase = "pre" | "live" | "post";
export type StageWorkflowStatus = "planning" | "rehearsal" | "ready" | "on-air" | "wrap" | "archived";
export type StageApprovalStatus = "pending" | "approved" | "blocked";
export type StageRundownStatus = "pending" | "standby" | "live" | "complete" | "skipped";
export type StageDeliverableStatus = "not-started" | "working" | "review" | "complete";
export type StageWorkflowCue = "standby" | "opening" | "speaker" | "demo" | "qa" | "sponsor" | "close";
export type StageWorkflowShot = "wide" | "host" | "audience" | "crane";

export interface StageCrewAssignment {
  id: string;
  department: string;
  role: string;
  assignee: string;
  callSign: string;
}

export interface StagePreflightCheck {
  id: string;
  label: string;
  owner: string;
  required: boolean;
  complete: boolean;
  completedAt: string | null;
}

export interface StageApproval {
  id: string;
  label: string;
  required: boolean;
  status: StageApprovalStatus;
  approver: string;
  decidedAt: string | null;
  note: string;
}

export interface StageRundownItem {
  id: string;
  order: number;
  title: string;
  kind: "open" | "segment" | "pod" | "sponsor" | "break" | "close";
  target: string;
  durationSec: number;
  owner: string;
  cue: StageWorkflowCue;
  shot: StageWorkflowShot;
  status: StageRundownStatus;
  startedAt: string | null;
  completedAt: string | null;
}

export interface StageDeliverable {
  id: string;
  label: string;
  owner: string;
  dueAt: string;
  status: StageDeliverableStatus;
}

export interface StageWorkflowActivity {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface StageShowWorkflow {
  productionId: string;
  phase: StageWorkflowPhase;
  status: StageWorkflowStatus;
  version: number;
  revision: number;
  updatedAt: string;
  createdAt: string;
  crew: StageCrewAssignment[];
  preflight: StagePreflightCheck[];
  approvals: StageApproval[];
  rundown: StageRundownItem[];
  currentItemId: string | null;
  showStartedAt: string | null;
  showEndedAt: string | null;
  holdStartedAt: string | null;
  holdReason: string;
  postNotes: string;
  deliverables: StageDeliverable[];
  activity: StageWorkflowActivity[];
}

export interface StageWorkflowReadiness {
  ready: boolean;
  checksComplete: number;
  checksRequired: number;
  approvalsComplete: number;
  approvalsRequired: number;
  crewAssigned: number;
  crewRequired: number;
  blockers: string[];
}

const VALID_PHASES: StageWorkflowPhase[] = ["pre", "live", "post"];
const VALID_STATUSES: StageWorkflowStatus[] = ["planning", "rehearsal", "ready", "on-air", "wrap", "archived"];
const VALID_APPROVALS: StageApprovalStatus[] = ["pending", "approved", "blocked"];
const VALID_RUNDOWN: StageRundownStatus[] = ["pending", "standby", "live", "complete", "skipped"];
const VALID_DELIVERABLES: StageDeliverableStatus[] = ["not-started", "working", "review", "complete"];
const VALID_CUES: StageWorkflowCue[] = ["standby", "opening", "speaker", "demo", "qa", "sponsor", "close"];
const VALID_SHOTS: StageWorkflowShot[] = ["wide", "host", "audience", "crane"];
const VALID_KINDS: StageRundownItem["kind"][] = ["open", "segment", "pod", "sponsor", "break", "close"];

function safeText(value: unknown, fallback = "", max = 80) {
  return String(value || fallback).replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
}

function safeId(value: unknown, fallback: string) {
  return safeText(value, fallback, 96).replace(/[^a-zA-Z0-9_-]/g, "") || fallback;
}

function safeAction(value: unknown, fallback: string) {
  return safeText(value, fallback, 64).replace(/[^a-zA-Z0-9._-]/g, "") || fallback;
}

function safeTimestamp(value: unknown, fallback: string | null = null) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function isoAt(value: string | number | Date = Date.now()) {
  return new Date(value).toISOString();
}

function initialCrew(): StageCrewAssignment[] {
  return [
    ["show-producer", "Production", "Executive producer", "EP"],
    ["director", "Production", "Show director", "DIR"],
    ["stage-manager", "Stage", "Stage manager", "SM"],
    ["technical-director", "Broadcast", "Technical director", "TD"],
    ["audio-lead", "Audio", "Audio lead", "A1"],
    ["camera-lead", "Camera", "Camera lead", "CAM"],
    ["pod-producer", "Pods", "Pod producer", "POD"],
    ["safety-moderator", "Safety", "Safety and moderation", "SAFE"],
  ].map(([id, department, role, callSign]) => ({ id, department, role, callSign, assignee: "" }));
}

function initialPreflight(): StagePreflightCheck[] {
  return [
    ["editorial", "Run of show and speaker content locked", "Producer"],
    ["video", "Camera, screen, and fallback sources verified", "Technical director"],
    ["audio", "Program mix, mics, stingers, and return audio verified", "Audio lead"],
    ["comms", "LiveKit room, Pod links, and crew comms verified", "Pod producer"],
    ["rights", "Media rights and sponsor creative cleared", "Producer"],
    ["accessibility", "Captions, access needs, and audience path assigned", "Stage manager"],
    ["recording", "Recording, stream destinations, and archive capacity ready", "Technical director"],
    ["safety", "Safety, moderation, incident, and evacuation brief complete", "Safety lead"],
  ].map(([id, label, owner]) => ({ id, label, owner, required: true, complete: false, completedAt: null }));
}

function initialApprovals(): StageApproval[] {
  return [
    ["editorial", "Editorial and content", true],
    ["technical", "Technical rehearsal", true],
    ["talent", "Talent and release", true],
    ["sponsor", "Sponsor and brand", true],
    ["safety", "Safety and compliance", true],
  ].map(([id, label, required]) => ({ id: String(id), label: String(label), required: Boolean(required), status: "pending", approver: "", decidedAt: null, note: "" }));
}

function initialRundown(): StageRundownItem[] {
  const items: Array<[string, StageRundownItem["kind"], number, StageWorkflowCue, StageWorkflowShot, string]> = [
    ["House open", "open", 900, "standby", "wide", "Stage manager"],
    ["Opening stinger", "open", 30, "opening", "wide", "Technical director"],
    ["Host welcome", "segment", 300, "speaker", "host", "Show director"],
    ["Pod showcase", "pod", 600, "demo", "wide", "Pod producer"],
    ["Main stage demo", "segment", 720, "demo", "host", "Show director"],
    ["Sponsor feature", "sponsor", 90, "sponsor", "wide", "Producer"],
    ["Audience Q&A", "segment", 600, "qa", "audience", "Stage manager"],
    ["Closing and next steps", "close", 240, "close", "wide", "Host"],
  ];
  return items.map(([title, kind, durationSec, cue, shot, owner], index) => ({
    id: `run-${index + 1}`,
    order: index + 1,
    title,
    kind,
    target: kind === "pod" ? "AMX-MAIN" : "MAIN-STAGE",
    durationSec,
    owner,
    cue,
    shot,
    status: "pending",
    startedAt: null,
    completedAt: null,
  }));
}

function initialDeliverables(now: Date): StageDeliverable[] {
  const due = (days: number) => isoAt(now.getTime() + days * 86_400_000);
  return [
    ["master", "Program master and clean feeds", "Technical director", due(1)],
    ["captions", "Transcript, captions, and accessibility QC", "Producer", due(2)],
    ["clips", "Approved social and Pod showcase clips", "Editor", due(3)],
    ["sponsor-report", "Sponsor proof and impression report", "Producer", due(3)],
    ["attendance", "Attendance, tickets, and learner proof export", "Event lead", due(1)],
    ["archive", "Archive package, rights notes, and retention lock", "Archivist", due(5)],
  ].map(([id, label, owner, dueAt]) => ({ id, label, owner, dueAt, status: "not-started" as const }));
}

export function defaultStageShowWorkflow(room = "AMXSTAGE", nowValue: string | number | Date = Date.now()): StageShowWorkflow {
  const now = new Date(nowValue);
  const timestamp = isoAt(now);
  const safeRoom = safeId(room.toUpperCase(), "AMXSTAGE");
  return {
    productionId: `production-${safeRoom.toLowerCase()}`,
    phase: "pre",
    status: "planning",
    version: 1,
    revision: now.getTime(),
    updatedAt: timestamp,
    createdAt: timestamp,
    crew: initialCrew(),
    preflight: initialPreflight(),
    approvals: initialApprovals(),
    rundown: initialRundown(),
    currentItemId: null,
    showStartedAt: null,
    showEndedAt: null,
    holdStartedAt: null,
    holdReason: "",
    postNotes: "",
    deliverables: initialDeliverables(now),
    activity: [{ id: "activity-created", at: timestamp, actor: "system", action: "workflow.created", detail: `Production workflow opened for ${safeRoom}` }],
  };
}

export function normalizeStageShowWorkflow(value: Partial<StageShowWorkflow> | undefined, room = "AMXSTAGE"): StageShowWorkflow {
  const fallback = defaultStageShowWorkflow(room);
  if (!value || typeof value !== "object") return fallback;
  const timestamp = safeTimestamp(value.updatedAt, fallback.updatedAt)!;
  const revision = Math.max(1, Math.round(Number(value.revision) || Date.parse(timestamp) || fallback.revision));
  const crew = initialCrew().map((item) => {
    const saved = Array.isArray(value.crew) ? value.crew.find((candidate) => candidate?.id === item.id) : undefined;
    return { ...item, assignee: safeText(saved?.assignee, "", 64), callSign: safeText(saved?.callSign, item.callSign, 12) };
  });
  const preflight = initialPreflight().map((item) => {
    const saved = Array.isArray(value.preflight) ? value.preflight.find((candidate) => candidate?.id === item.id) : undefined;
    return { ...item, owner: safeText(saved?.owner, item.owner, 64), complete: Boolean(saved?.complete), completedAt: safeTimestamp(saved?.completedAt) };
  });
  const approvals = initialApprovals().map((item) => {
    const saved = Array.isArray(value.approvals) ? value.approvals.find((candidate) => candidate?.id === item.id) : undefined;
    return {
      ...item,
      status: VALID_APPROVALS.includes(saved?.status as StageApprovalStatus) ? saved!.status : "pending",
      approver: safeText(saved?.approver, "", 64),
      decidedAt: safeTimestamp(saved?.decidedAt),
      note: safeText(saved?.note, "", 180),
    };
  });
  const rundownInput = Array.isArray(value.rundown) && value.rundown.length ? value.rundown.slice(0, 48) : fallback.rundown;
  const seen = new Set<string>();
  const rundown = rundownInput.map((item, index) => {
    const id = safeId(item?.id, `run-${index + 1}`);
    const uniqueId = seen.has(id) ? `${id}-${index + 1}` : id;
    seen.add(uniqueId);
    return {
      id: uniqueId,
      order: index + 1,
      title: safeText(item?.title, `Segment ${index + 1}`, 80),
      kind: VALID_KINDS.includes(item?.kind as StageRundownItem["kind"]) ? item!.kind : "segment",
      target: safeId(item?.target, "MAIN-STAGE").toUpperCase().slice(0, 24),
      durationSec: Math.max(10, Math.min(14_400, Math.round(Number(item?.durationSec) || 300))),
      owner: safeText(item?.owner, "Producer", 64),
      cue: VALID_CUES.includes(item?.cue as StageWorkflowCue) ? item!.cue : "speaker",
      shot: VALID_SHOTS.includes(item?.shot as StageWorkflowShot) ? item!.shot : "wide",
      status: VALID_RUNDOWN.includes(item?.status as StageRundownStatus) ? item!.status : "pending",
      startedAt: safeTimestamp(item?.startedAt),
      completedAt: safeTimestamp(item?.completedAt),
    } satisfies StageRundownItem;
  });
  const deliverables = initialDeliverables(new Date(fallback.createdAt)).map((item) => {
    const saved = Array.isArray(value.deliverables) ? value.deliverables.find((candidate) => candidate?.id === item.id) : undefined;
    return {
      ...item,
      owner: safeText(saved?.owner, item.owner, 64),
      dueAt: safeTimestamp(saved?.dueAt, item.dueAt)!,
      status: VALID_DELIVERABLES.includes(saved?.status as StageDeliverableStatus) ? saved!.status : "not-started",
    };
  });
  const activity = (Array.isArray(value.activity) ? value.activity : fallback.activity).slice(-160).map((item, index) => ({
    id: safeId(item?.id, `activity-${index + 1}`),
    at: safeTimestamp(item?.at, timestamp)!,
    actor: safeText(item?.actor, "operator", 64),
    action: safeAction(item?.action, "workflow.updated"),
    detail: safeText(item?.detail, "Workflow updated", 180),
  }));
  const currentItemId = rundown.some((item) => item.id === value.currentItemId) ? value.currentItemId! : null;
  return {
    ...fallback,
    productionId: safeId(value.productionId, fallback.productionId),
    phase: VALID_PHASES.includes(value.phase as StageWorkflowPhase) ? value.phase! : fallback.phase,
    status: VALID_STATUSES.includes(value.status as StageWorkflowStatus) ? value.status! : fallback.status,
    version: Math.max(1, Math.min(999, Math.round(Number(value.version) || 1))),
    revision,
    updatedAt: new Date(revision).toISOString(),
    createdAt: safeTimestamp(value.createdAt, fallback.createdAt)!,
    crew,
    preflight,
    approvals,
    rundown,
    currentItemId,
    showStartedAt: safeTimestamp(value.showStartedAt),
    showEndedAt: safeTimestamp(value.showEndedAt),
    holdStartedAt: safeTimestamp(value.holdStartedAt),
    holdReason: safeText(value.holdReason, "", 120),
    postNotes: safeText(value.postNotes, "", 4000),
    deliverables,
    activity,
  };
}

export function stageWorkflowReadiness(workflow: StageShowWorkflow): StageWorkflowReadiness {
  const requiredChecks = workflow.preflight.filter((item) => item.required);
  const requiredApprovals = workflow.approvals.filter((item) => item.required);
  const checksComplete = requiredChecks.filter((item) => item.complete).length;
  const approvalsComplete = requiredApprovals.filter((item) => item.status === "approved").length;
  const blocked = requiredApprovals.filter((item) => item.status === "blocked");
  const crewAssigned = workflow.crew.filter((item) => item.assignee.trim()).length;
  const blockers: string[] = [];
  if (checksComplete < requiredChecks.length) blockers.push(`${requiredChecks.length - checksComplete} required check${requiredChecks.length - checksComplete === 1 ? "" : "s"} open`);
  if (approvalsComplete < requiredApprovals.length) blockers.push(`${requiredApprovals.length - approvalsComplete} approval${requiredApprovals.length - approvalsComplete === 1 ? "" : "s"} open`);
  if (blocked.length) blockers.push(`${blocked.length} approval${blocked.length === 1 ? "" : "s"} blocked`);
  if (crewAssigned < workflow.crew.length) blockers.push(`${workflow.crew.length - crewAssigned} crew role${workflow.crew.length - crewAssigned === 1 ? "" : "s"} unassigned`);
  if (!workflow.rundown.length) blockers.push("Rundown is empty");
  return {
    ready: blockers.length === 0,
    checksComplete,
    checksRequired: requiredChecks.length,
    approvalsComplete,
    approvalsRequired: requiredApprovals.length,
    crewAssigned,
    crewRequired: workflow.crew.length,
    blockers,
  };
}

export function reviseStageShowWorkflow(
  workflow: StageShowWorkflow,
  patch: Partial<StageShowWorkflow>,
  activity?: { action: string; detail: string; actor?: string },
  nowValue: string | number | Date = Date.now(),
) {
  const now = isoAt(nowValue);
  const revision = Math.max(workflow.revision + 1, new Date(nowValue).getTime());
  const nextActivity = activity ? [...workflow.activity, {
    id: `activity-${revision}-${safeId(activity.action, "updated")}`,
    at: now,
    actor: safeText(activity.actor, "operator", 64),
    action: safeAction(activity.action, "workflow.updated"),
    detail: safeText(activity.detail, "Workflow updated", 180),
  }].slice(-160) : workflow.activity;
  return normalizeStageShowWorkflow({ ...workflow, ...patch, activity: nextActivity, revision, updatedAt: now }, workflow.productionId.replace(/^production-/, ""));
}

export function takeStageRundownItem(workflow: StageShowWorkflow, itemId: string, actor = "operator", nowValue: string | number | Date = Date.now()) {
  const now = isoAt(nowValue);
  const selected = workflow.rundown.find((item) => item.id === itemId);
  if (!selected) return workflow;
  const rundown = workflow.rundown.map((item) => {
    if (item.id === itemId) return { ...item, status: "live" as const, startedAt: item.startedAt || now, completedAt: null };
    if (item.status === "live") return { ...item, status: "complete" as const, completedAt: now };
    return item;
  });
  return reviseStageShowWorkflow(workflow, {
    phase: "live",
    status: "on-air",
    currentItemId: itemId,
    showStartedAt: workflow.showStartedAt || now,
    showEndedAt: null,
    holdStartedAt: null,
    rundown,
  }, { action: "rundown.take", detail: `${selected.title} taken on ${selected.target}`, actor }, nowValue);
}

export function completeStageRundownItem(workflow: StageShowWorkflow, itemId: string, actor = "operator", nowValue: string | number | Date = Date.now()) {
  const selected = workflow.rundown.find((item) => item.id === itemId);
  if (!selected) return workflow;
  const now = isoAt(nowValue);
  const rundown = workflow.rundown.map((item) => item.id === itemId ? { ...item, status: "complete" as const, completedAt: now } : item);
  return reviseStageShowWorkflow(workflow, { rundown, currentItemId: workflow.currentItemId === itemId ? null : workflow.currentItemId }, { action: "rundown.complete", detail: `${selected.title} completed`, actor }, nowValue);
}

export function stageWorkflowReport(workflow: StageShowWorkflow, context: Record<string, unknown> = {}) {
  const readiness = stageWorkflowReadiness(workflow);
  const plannedDurationSec = workflow.rundown.reduce((total, item) => total + item.durationSec, 0);
  const completed = workflow.rundown.filter((item) => item.status === "complete").length;
  return {
    schema: "amx.stage.production-report.v1",
    generatedAt: new Date().toISOString(),
    production: {
      id: workflow.productionId,
      version: workflow.version,
      phase: workflow.phase,
      status: workflow.status,
      startedAt: workflow.showStartedAt,
      endedAt: workflow.showEndedAt,
      plannedDurationSec,
    },
    readiness,
    completion: {
      rundown: { complete: completed, total: workflow.rundown.length },
      deliverables: { complete: workflow.deliverables.filter((item) => item.status === "complete").length, total: workflow.deliverables.length },
    },
    crew: workflow.crew,
    preflight: workflow.preflight,
    approvals: workflow.approvals,
    rundown: workflow.rundown,
    deliverables: workflow.deliverables,
    postNotes: workflow.postNotes,
    activity: workflow.activity,
    context,
  };
}

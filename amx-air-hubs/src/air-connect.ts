export type AirPool = {
  id: string;
  tenantId: string;
  name: string;
  resourceType: "DATA_MB";
  totalUnits: number;
  availableUnits: number;
  status: string;
  providerId: string | null;
  locationId: string | null;
  downloadCapacityMbps: number;
  uploadCapacityMbps: number;
  upstreamCostCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type AirProvider = { id: string; name: string; providerType: string; serviceType: string; downloadMbps: number; uploadMbps: number; dataCapMb: number; monthlyCostCents: number; currency: string; rights: Record<string, boolean>; status: string; updatedAt: string };
export type AirNode = { id: string; name: string; locationId: string; adapterType: string; status: string; lastHeartbeatAt: string | null; capabilities: string[]; updatedAt: string };
export type AirPolicy = { id: string; runtimeId: string; roomId: string; version: number; status: string; payload: Record<string, unknown>; appliedAt: string | null; removedAt: string | null; updatedAt: string };
export type AirEdgeCommand = { id: string; nodeId: string; runtimeId: string | null; policyId: string | null; action: string; status: string; issuedAt: string; expiresAt: string; signatureAlgorithm: string; acknowledgedAt: string | null };
export type AirUsageSample = { id: string; runtimeId: string; roomId: string; deviceId: string; bytesDown: number; bytesUp: number; downloadMbps: number; uploadMbps: number; latencyMs: number; jitterMs: number; packetLoss: number; recordedAt: string };
export type AirSession = { id: string; runtimeId: string; userId: string | null; deviceId: string; roomId: string; connectedAt: string; disconnectedAt: string | null; bytesDown: number; bytesUp: number; totalMb: number; terminationReason: string | null };
export type AirAlert = { id: string; runtimeId: string | null; type: string; severity: string; status: string; message: string; payload: Record<string, unknown>; createdAt: string };
export type AirReport = { id: string; runtimeId: string; eventId: string | null; programId: string | null; type: string; payload: Record<string, unknown>; generatedAt: string };

export type AirRuntime = {
  id: string;
  tenantId: string;
  poolId: string;
  roomCode: string;
  name: string;
  allocationUnits: number;
  consumedUnits: number;
  learnerCount: number;
  trainerCount: number;
  agentCount: number;
  learnerIds: string[];
  bandwidthMbps: number;
  videoProfile: string;
  livekitRoom: string;
  livekitDispatch: { configured: boolean; dispatched: boolean; agentName?: string } | null;
  status: "allocated" | "active" | "closing" | "closed";
  report: Record<string, unknown> | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile: {
    roomId: string; eventId: string | null; programId: string | null; reservedMb: number;
    downloadLimitMbps: number; uploadLimitMbps: number; minGuaranteedMbps: number;
    burstLimitMbps: number; maxUsers: number; maxDevices: number; priorityClass: string;
    startsAt: string | null; endsAt: string | null; autoReturnUnused: boolean;
    networkPolicyId: string | null; edgeNodeId: string | null; policyVersion: number;
    admissionsOpen: boolean; cost: Record<string, unknown>;
  } | null;
};

export type AirTransaction = {
  id: string;
  poolId: string | null;
  runtimeId: string | null;
  walletId: string | null;
  type: string;
  resourceType: "DATA_MB" | "AIR_CREDIT";
  amountUnits: number;
  balanceAfter: number | null;
  actorId: string;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AirConnectState = {
  pools: AirPool[];
  runtimes: AirRuntime[];
  providers: AirProvider[];
  nodes: AirNode[];
  policies: AirPolicy[];
  edgeCommands: AirEdgeCommand[];
  usageSamples: AirUsageSample[];
  sessions: AirSession[];
  alerts: AirAlert[];
  reports: AirReport[];
  walletSummary: { wallets: number; creditsIssued: number };
  transactions: AirTransaction[];
  persisted: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `AIR Connect request failed (${response.status})`);
  return payload;
}

export function getAirConnectState(tenantId: string) {
  return api<AirConnectState>(`/api/air-connect/state?tenantId=${encodeURIComponent(tenantId)}`);
}

export function runAirConnectAction(tenantId: string, action: string, input: Record<string, unknown> = {}) {
  return api<Record<string, unknown>>("/api/air-connect/actions", { method: "POST", body: JSON.stringify({ tenantId, action, operatorApproved: true, ...input }) });
}

export function formatDataUnits(units: number) {
  if (Math.abs(units) >= 1000) return `${(units / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`;
  return `${units.toLocaleString()} MB`;
}

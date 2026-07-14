import type { TwinTelemetry } from "./digital-twin";

export type DataCenterScenarioId = "normal-operations" | "tenant-burst" | "hot-aisle" | "network-degradation" | "ups-transfer";

export interface TenantProfile {
  id: string;
  name: string;
  workload: string;
  sla: string;
  reservedKw: number;
  rackCount: number;
  color: string;
}

export interface RackTelemetry {
  id: string;
  label: string;
  workload: string;
  powerKw: number;
  inletC: number;
  capacityPercent: number;
  networkGbps: number;
  health: "nominal" | "watch" | "critical";
}

export interface DataCenterSnapshot {
  timestamp: string;
  source: "training simulation" | "mapped DCIM";
  tenant: TenantProfile;
  scenario: DataCenterScenarioId;
  itLoadKw: number;
  facilityKw: number;
  pue: number;
  coolingKw: number;
  networkGbps: number;
  storageTb: number;
  availabilityPercent: number;
  carbonGramsPerKwh: number;
  racks: RackTelemetry[];
  alarms: string[];
}

export interface DataCenterScenario {
  id: DataCenterScenarioId;
  label: string;
  detail: string;
  objective: string;
}

export const tenantProfiles: TenantProfile[] = [
  { id: "northstar-ai", name: "Northstar AI", workload: "GPU inference + vector search", sla: "99.99% / Gold", reservedKw: 86, rackCount: 4, color: "#58e6ff" },
  { id: "civic-health", name: "Civic Health Lab", workload: "Clinical simulation + imaging", sla: "99.95% / Protected", reservedKw: 62, rackCount: 3, color: "#ff72d2" },
  { id: "maker-grid", name: "Maker Grid", workload: "Workshop render + build agents", sla: "99.9% / Flexible", reservedKw: 44, rackCount: 3, color: "#a6f06d" },
];

export const dataCenterScenarios: DataCenterScenario[] = [
  { id: "normal-operations", label: "Normal ops", detail: "Steady tenant demand and healthy redundancy.", objective: "Read the operating baseline and identify available headroom." },
  { id: "tenant-burst", label: "Tenant burst", detail: "GPU demand rises beyond the reserved envelope.", objective: "Protect the SLA while finding safe compute capacity." },
  { id: "hot-aisle", label: "Hot aisle", detail: "Rack inlet temperature rises after airflow loss.", objective: "Diagnose the thermal path and stage a no-regret response." },
  { id: "network-degradation", label: "Network loss", detail: "East-west throughput falls and latency rises.", objective: "Isolate the affected rack and preserve critical traffic." },
  { id: "ups-transfer", label: "UPS transfer", detail: "The pod transfers to protected power.", objective: "Validate continuity, shed flexible load, and verify recovery." },
];

const scenarioOffsets: Record<DataCenterScenarioId, { load: number; temperature: number; network: number; availability: number; pue: number }> = {
  "normal-operations": { load: 0, temperature: 0, network: 0, availability: 0, pue: 0 },
  "tenant-burst": { load: 22, temperature: 4.2, network: 7, availability: -0.01, pue: 0.06 },
  "hot-aisle": { load: 4, temperature: 11.5, network: 0, availability: -0.03, pue: 0.18 },
  "network-degradation": { load: -7, temperature: 1.5, network: -18, availability: -0.08, pue: 0.03 },
  "ups-transfer": { load: -16, temperature: 2.2, network: -3, availability: -0.04, pue: 0.11 },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, precision = 1) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

export function buildDataCenterSnapshot(telemetry: TwinTelemetry, tenant: TenantProfile, scenario: DataCenterScenarioId): DataCenterSnapshot {
  const offset = scenarioOffsets[scenario];
  const normalizedLoad = clamp(telemetry.utilizationPercent + offset.load, 18, 108);
  const itLoadKw = round(tenant.reservedKw * normalizedLoad / 100);
  const pue = round(clamp(1.22 + (100 - telemetry.coolingPercent) / 280 + offset.pue, 1.12, 1.85), 2);
  const facilityKw = round(itLoadKw * pue);
  const rackLoad = itLoadKw / tenant.rackCount;
  const baseNetwork = Math.max(3, telemetry.throughput / 4 + offset.network);
  const racks = Array.from({ length: tenant.rackCount }, (_, index): RackTelemetry => {
    const positionBias = (index - (tenant.rackCount - 1) / 2) * 0.8;
    const capacityPercent = Math.round(clamp(normalizedLoad + index * 3 - 4, 8, 112));
    const inletC = round(20.5 + (telemetry.temperatureC - 38) * 0.28 + offset.temperature + Math.max(0, positionBias));
    const networkGbps = round(Math.max(0.4, baseNetwork / tenant.rackCount + index * 0.7));
    const health = inletC >= 31 || capacityPercent >= 102 || networkGbps < 1.5 ? "critical" : inletC >= 27 || capacityPercent >= 88 ? "watch" : "nominal";
    return {
      id: `${tenant.id}-r${String(index + 1).padStart(2, "0")}`,
      label: `R${String(index + 1).padStart(2, "0")}`,
      workload: index === 0 ? "control + agents" : index === tenant.rackCount - 1 ? "storage + replicas" : tenant.workload.split(" + ")[0],
      powerKw: round(rackLoad * (0.91 + index * 0.05)),
      inletC,
      capacityPercent,
      networkGbps,
      health,
    };
  });
  const alarms = racks.flatMap((rack) => {
    const messages: string[] = [];
    if (rack.inletC >= 27) messages.push(`${rack.label} inlet temperature ${rack.inletC.toFixed(1)} C`);
    if (rack.capacityPercent >= 100) messages.push(`${rack.label} capacity exceeds reserved envelope`);
    if (rack.networkGbps < 1.5) messages.push(`${rack.label} east-west network degradation`);
    return messages;
  });
  if (scenario === "ups-transfer") alarms.unshift("Pod operating on protected UPS path");
  return {
    timestamp: telemetry.timestamp,
    source: telemetry.source === "sensor" ? "mapped DCIM" : "training simulation",
    tenant,
    scenario,
    itLoadKw,
    facilityKw,
    pue,
    coolingKw: round(Math.max(0, facilityKw - itLoadKw)),
    networkGbps: round(racks.reduce((sum, rack) => sum + rack.networkGbps, 0)),
    storageTb: Math.round(tenant.rackCount * 148 * (0.62 + normalizedLoad / 500)),
    availabilityPercent: round(clamp(99.99 + offset.availability, 99.5, 100), 3),
    carbonGramsPerKwh: Math.round(292 + Math.sin(Date.parse(telemetry.timestamp) / 240_000) * 34),
    racks,
    alarms,
  };
}

export function dataCenterAgentContext(snapshot: DataCenterSnapshot) {
  return {
    tenant: { id: snapshot.tenant.id, name: snapshot.tenant.name, workload: snapshot.tenant.workload, sla: snapshot.tenant.sla },
    provenance: snapshot.source,
    scenario: snapshot.scenario,
    pod: {
      itLoadKw: snapshot.itLoadKw,
      facilityKw: snapshot.facilityKw,
      pue: snapshot.pue,
      networkGbps: snapshot.networkGbps,
      availabilityPercent: snapshot.availabilityPercent,
    },
    racks: snapshot.racks,
    alarms: snapshot.alarms,
    timestamp: snapshot.timestamp,
    guardrail: "Recommend and simulate only. Physical actuation requires an authorized human operator.",
  };
}

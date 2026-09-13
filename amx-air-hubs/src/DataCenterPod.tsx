import { useState } from "react";
import { Activity, BookOpenCheck, Bot, Braces, Cable, CheckCircle2, Gauge, Network, PlugZap, Route, Server, Thermometer, Wrench, Zap } from "lucide-react";
import { invokeAgentTool } from "./agent-runtime";
import { dataCenterAgentContext, dataCenterScenarios, tenantProfiles, type DataCenterScenarioId, type DataCenterSnapshot } from "./data-center-twin";
import { StatusPill } from "./components";
import { ProjectCourse } from "./ProjectCourse";
import { useProjectLearning } from "./project-learning";

interface Props {
  roomCode: string;
  snapshot: DataCenterSnapshot;
  tenantId: string;
  scenario: DataCenterScenarioId;
  onTenantChange: (tenantId: string) => void;
  onScenarioChange: (scenario: DataCenterScenarioId) => void;
}

const operationsTools = [
  { id: "dcim.inspect", label: "Inspect pod", source: "SKILL", icon: Server },
  { id: "rack.thermal-map", label: "Thermal map", source: "SKILL", icon: Thermometer },
  { id: "tenant.capacity-plan", label: "Capacity plan", source: "SKILL", icon: Gauge },
  { id: "incident.runbook", label: "Incident plan", source: "SKILL", icon: Wrench },
  { id: "workshop.brief", label: "Workshop brief", source: "SKILL", icon: BookOpenCheck },
  { id: "mission.context", label: "Mission state", source: "RUNTIME", icon: Route },
  { id: "mcp.tools", label: "MCP catalog", source: "MCP", icon: Braces },
  { id: "plugin.catalog", label: "Plugin catalog", source: "PLUGIN", icon: PlugZap },
];

function toneForHealth(health: "nominal" | "watch" | "critical") {
  return health === "nominal" ? "green" : health === "watch" ? "gold" : "red";
}

export function DataCenterPod({ roomCode, snapshot, tenantId, scenario, onTenantChange, onScenarioChange }: Props) {
  const [runningTool, setRunningTool] = useState("");
  const [toolResult, setToolResult] = useState<{ name: string; output: string } | null>(null);
  const project = useProjectLearning(tenantId);
  const activeScenario = dataCenterScenarios.find((item) => item.id === scenario) || dataCenterScenarios[0];

  const runTool = async (toolName: string) => {
    if (runningTool) return;
    setRunningTool(toolName);
    const result = await invokeAgentTool(toolName, "naz", dataCenterAgentContext(snapshot));
    project.recordTool(result.trace);
    setToolResult({ name: toolName, output: result.output });
    setRunningTool("");
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) {
      const createdAt = new Date().toISOString();
      void fetch("/api/twins/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          tenantId: snapshot.tenant.id,
          twinId: "mini-data-center-pod-01",
          roomCode,
          eventType: "skill",
          payload: { toolName, scenario, source: snapshot.source, alarms: snapshot.alarms, trace: result.trace },
          createdAt,
        }),
      }).catch(() => undefined);
    }
  };

  return <section className="dc-pod-console" aria-label="Mini data center tenant operations pod">
    <div className="dc-pod-heading">
      <div><span className="eyebrow">MINI DATA CENTER POD</span><h3>Tenant operations</h3></div>
      <StatusPill tone={snapshot.feed.mode === "live" ? "green" : "gold"}>{snapshot.feed.mode === "stale" ? "stale feed / simulation" : snapshot.source}</StatusPill>
    </div>

    <div className="dc-tenant-strip" aria-label="Data center tenants">
      {tenantProfiles.map((tenant) => <button key={tenant.id} aria-pressed={tenant.id === tenantId} className={`${tenant.id === tenantId ? "active " : ""}tenant-${tenant.id}`} onClick={() => onTenantChange(tenant.id)}>
        <span>{tenant.name}</span><small>{tenant.workload}</small>
      </button>)}
    </div>

    <div className="dc-context-band">
      <div><span>Tenant SLA</span><b>{snapshot.tenant.sla}</b></div>
      <div><span>Reserved power</span><b>{snapshot.tenant.reservedKw} kW</b></div>
      <div><span>Workload</span><b>{snapshot.tenant.workload}</b></div>
      <div><span>Telemetry</span><b>{snapshot.feed.adapter.toUpperCase()} / {snapshot.feed.mode === "live" ? `${snapshot.feed.ageSeconds}s old` : snapshot.feed.mode === "stale" ? "STALE" : snapshot.feed.adapter === "simulation" ? "GENERATED" : "SCENARIO"}</b></div>
    </div>

    <div className="dc-kpi-grid">
      <div><Zap/><span><small>IT load</small><b>{snapshot.itLoadKw.toFixed(1)} kW</b></span></div>
      <div><Activity/><span><small>PUE</small><b>{snapshot.pue.toFixed(2)}</b></span></div>
      <div><Network/><span><small>Network</small><b>{snapshot.networkGbps.toFixed(1)} Gbps</b></span></div>
      <div><CheckCircle2/><span><small>Availability</small><b>{snapshot.availabilityPercent.toFixed(3)}%</b></span></div>
    </div>

    <div className="dc-rack-panel">
      <div className="dc-panel-title"><span><Server/>Rack map</span><small>{snapshot.racks.length} racks / {snapshot.storageTb} TB</small></div>
      <div className="dc-rack-grid">
        {snapshot.racks.map((rack) => <article key={rack.id} className={`dc-rack ${rack.health}`}>
          <header><b>{rack.label}</b><StatusPill tone={toneForHealth(rack.health)}>{rack.health}</StatusPill></header>
          <p>{rack.workload}</p>
          <dl>
            <div><dt>POWER</dt><dd>{rack.powerKw.toFixed(1)} kW</dd></div>
            <div><dt>INLET</dt><dd>{rack.inletC.toFixed(1)} C</dd></div>
            <div><dt>CAPACITY</dt><dd>{rack.capacityPercent}%</dd></div>
            <div><dt>NETWORK</dt><dd>{rack.networkGbps.toFixed(1)} Gbps</dd></div>
          </dl>
          <span className="dc-rack-load"><i style={{ width: `${Math.min(100, rack.capacityPercent)}%` }}/></span>
        </article>)}
      </div>
    </div>

    <div className="dc-training-grid">
      <div className="dc-scenario-panel">
        <div className="dc-panel-title"><span><BookOpenCheck/>Training simulator</span><small>choose an operating condition</small></div>
        <div>{dataCenterScenarios.map((item) => <button key={item.id} className={scenario === item.id ? "active" : ""} onClick={() => onScenarioChange(item.id)}><b>{item.label}</b><span>{item.detail}</span></button>)}</div>
        <p><b>Objective:</b> {activeScenario.objective}</p>
      </div>
      <div className="dc-alarm-panel">
        <div className="dc-panel-title"><span><Cable/>Operational context</span><small>{snapshot.alarms.length} active</small></div>
        {snapshot.alarms.length ? <ul>{snapshot.alarms.map((alarm) => <li key={alarm}>{alarm}</li>)}</ul> : <p className="dc-clear-state"><CheckCircle2/>No active tenant alarms. Use a training condition to explore incident response.</p>}
        <div className="dc-energy-context"><span>Facility {snapshot.facilityKw.toFixed(1)} kW</span><span>Cooling {snapshot.coolingKw.toFixed(1)} kW</span><span>Grid {snapshot.carbonGramsPerKwh} gCO2/kWh</span></div>
      </div>
    </div>

    <div className="dc-toolbelt">
      <div className="dc-panel-title"><span><Bot/>Agent toolbelt</span><small>context-bound / human governed</small></div>
      <div>{operationsTools.map((tool) => { const Icon = tool.icon; return <button key={tool.id} disabled={Boolean(runningTool)} onClick={() => void runTool(tool.id)}><Icon/><span>{tool.label}</span><small>{tool.source}</small>{runningTool === tool.id && <i/>}</button>; })}</div>
      {toolResult && <output><Wrench/><span><b>{toolResult.name}</b><small>{toolResult.output}</small></span></output>}
    </div>
    <ProjectCourse
      state={project.state}
      progress={project.progress}
      completedTools={project.completedTools}
      onConfirmKnow={() => { onScenarioChange("hot-aisle"); project.confirmKnow(); }}
      onRunTool={(toolName) => void runTool(toolName)}
      onReflection={project.setReflection}
      onComplete={project.complete}
    />
  </section>;
}

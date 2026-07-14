import { lazy, Suspense, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, Boxes, CheckCircle2, Gauge, Send, ShieldCheck, Sparkles, Thermometer, Waves, Zap } from "lucide-react";
import { agents } from "./data";
import { sendAgentRequest } from "./agent-runtime";
import { twinScenarios, useDigitalTwin, type TwinScenarioId } from "./digital-twin";
import { Metric, StatusPill } from "./components";
import { runSimulationSkill, simulationSkills, type SimulationSkillId, type SimulationSkillRun } from "./simulation-skills";
import { DataCenterPod } from "./DataCenterPod";
import { buildDataCenterSnapshot, dataCenterAgentContext, mergeLiveDataCenterSnapshot, tenantProfiles, type DataCenterScenarioId } from "./data-center-twin";
import { useDataCenterTelemetry } from "./use-data-center-telemetry";

const DigitalTwinScene = lazy(async () => ({ default: (await import("./DigitalTwinScene")).DigitalTwinScene }));

interface Props {
  roomCode: string;
  reducedMotion?: boolean;
  onBackend?: (backend: "webgpu" | "webgl2") => void;
}

export function DigitalTwinLab({ roomCode, reducedMotion, onBackend }: Props) {
  const twin = useDigitalTwin(roomCode);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("Ask the twin about health, risk, maintenance, or a scenario comparison.");
  const [asking, setAsking] = useState(false);
  const [runningSkill, setRunningSkill] = useState<SimulationSkillId | null>(null);
  const [skillRun, setSkillRun] = useState<SimulationSkillRun | null>(null);
  const [tenantId, setTenantId] = useState(tenantProfiles[0].id);
  const [dataCenterScenario, setDataCenterScenario] = useState<DataCenterScenarioId>("normal-operations");
  const scenario = useMemo(() => twinScenarios.find((item) => item.id === twin.scenario) || twinScenarios[0], [twin.scenario]);
  const tenant = useMemo(() => tenantProfiles.find((item) => item.id === tenantId) || tenantProfiles[0], [tenantId]);
  const liveDataCenter = useDataCenterTelemetry(tenantId);
  const dataCenter = useMemo(() => mergeLiveDataCenterSnapshot(buildDataCenterSnapshot(twin.telemetry, tenant, dataCenterScenario), liveDataCenter), [dataCenterScenario, liveDataCenter, tenant, twin.telemetry]);

  const askTwin = async () => {
    const prompt = question.trim();
    if (!prompt || asking) return;
    setAsking(true);
    const context = `Digital twin ${roomCode}. Provenance: ${twin.telemetry.source}. Telemetry: ${JSON.stringify(twin.telemetry)}. Forecast: ${JSON.stringify(twin.forecast)}. Active scenario: ${scenario.label}. Tenant data-center context: ${JSON.stringify(dataCenterAgentContext(dataCenter))}. Question: ${prompt}`;
    const response = await sendAgentRequest(agents[0], context, [], "text");
    setAnswer(response.text);
    setQuestion("");
    setAsking(false);
  };

  const executeSkill = async (skillId: SimulationSkillId) => {
    if (runningSkill) return;
    setRunningSkill(skillId);
    setSkillRun(await runSimulationSkill(skillId, roomCode));
    setRunningSkill(null);
  };

  return <div className="section-wrap digital-twin-layout">
    <section className="digital-twin-viewport">
      <Suspense fallback={<div className="nexus-scene-loading"><span/><b>Preparing twin renderer</b></div>}>
        <DigitalTwinScene telemetry={twin.telemetry} forecast={twin.forecast} reducedMotion={reducedMotion} onBackend={onBackend}/>
      </Suspense>
      <div className="digital-twin-overlay"><span>BLENDER GLB / LIVE STATE</span><b>AMX FACILITY CELL 01</b><StatusPill tone={twin.telemetry.source === "sensor" ? "green" : "gold"}>{twin.telemetry.source}</StatusPill></div>
    </section>
    <aside className="digital-twin-console">
      <div className="section-heading"><div><span className="eyebrow">AI DIGITAL TWIN</span><h2>Observe and predict</h2></div><StatusPill tone={twin.forecast.state === "nominal" ? "green" : twin.forecast.state === "watch" ? "gold" : "red"}>{twin.forecast.state}</StatusPill></div>
      <div className="twin-metric-grid">
        <Metric label="Health" value={`${twin.forecast.healthPercent}%`} delta={`${twin.forecast.riskPercent}% predicted risk`} icon={ShieldCheck}/>
        <Metric label="Temperature" value={`${twin.telemetry.temperatureC.toFixed(1)} C`} delta={`${twin.telemetry.coolingPercent}% cooling`} icon={Thermometer}/>
        <Metric label="Vibration" value={`${twin.telemetry.vibrationMmS.toFixed(2)}`} delta="mm/s RMS" icon={Waves}/>
        <Metric label="Energy" value={`${twin.telemetry.energyKw.toFixed(1)} kW`} delta={`${twin.telemetry.utilizationPercent}% utilization`} icon={Zap}/>
      </div>
      <DataCenterPod roomCode={roomCode} snapshot={dataCenter} tenantId={tenantId} scenario={dataCenterScenario} onTenantChange={setTenantId} onScenarioChange={setDataCenterScenario}/>
      <div className="twin-forecast"><AlertTriangle/><div><b>{twin.forecast.failureWindowHours ? `Potential intervention in ${twin.forecast.failureWindowHours}h` : "No predicted failure window"}</b><p>{twin.forecast.recommendation}</p></div></div>
      <div className="twin-scenarios"><span className="eyebrow">WHAT-IF SANDBOX</span><div>{twinScenarios.map((item) => <button key={item.id} className={twin.scenario === item.id ? "active" : ""} onClick={() => twin.runScenario(item.id as TwinScenarioId)}><b>{item.label}</b><span>{item.detail}</span></button>)}</div></div>
      <div className="twin-skill-studio"><div><span className="eyebrow">REALITY RECONSTRUCTION SKILLS</span><StatusPill tone="cyan">PBR PIPELINE</StatusPill></div><div>{simulationSkills.map((skill) => <button key={skill.id} disabled={Boolean(runningSkill)} className={skillRun?.skillId === skill.id ? "active" : ""} onClick={() => void executeSkill(skill.id)}><Boxes/><span><b>{skill.label}</b><small>{skill.detail}</small></span>{runningSkill === skill.id ? <i>RUNNING</i> : <i>RUN</i>}</button>)}</div>{skillRun && <div className="twin-skill-result"><Sparkles/><span><b>{skillRun.confidence}% reconstruction confidence</b><small>{skillRun.summary}</small><code>{skillRun.artifacts.join(" / ")}</code></span></div>}</div>
      {twin.result && <div className="twin-result"><div><Activity/><span><b>{twin.result.projected.healthPercent}% projected health</b><small>{twin.result.projected.riskPercent - twin.result.baseline.riskPercent >= 0 ? "+" : ""}{twin.result.projected.riskPercent - twin.result.baseline.riskPercent}% risk delta</small></span></div><p>{twin.result.recommendation}</p><button className="button secondary full" disabled={twin.result.approved} onClick={twin.approveResult}>{twin.result.approved ? <CheckCircle2/> : <Gauge/>}{twin.result.approved ? "Plan approved for operator handoff" : "Approve sandbox plan"}</button><small>Approval records intent only. No physical actuator is connected.</small></div>}
      <div className="twin-copilot"><div><Bot/><span><b>Ask the twin</b><small>NAZ / contextual analysis</small></span></div><p>{answer}</p><div><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void askTwin(); }} placeholder="What changes under peak load?"/><button type="button" aria-label="Send question to the digital twin" title="Send question to the digital twin" disabled={!question.trim() || asking} onClick={() => void askTwin()}><Send/></button></div></div>
      <div className="twin-provenance"><span><i className="live-dot"/>{twin.transport}</span><span>{twin.telemetry.source === "sensor" ? "Physical telemetry" : "Synthetic telemetry"}</span><time>{new Date(twin.telemetry.timestamp).toLocaleTimeString()}</time></div>
    </aside>
  </div>;
}

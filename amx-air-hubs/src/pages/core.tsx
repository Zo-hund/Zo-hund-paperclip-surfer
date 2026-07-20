import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, Bot, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight,
  CircleDollarSign, CircleUserRound, Clock3, Compass, Cpu, Gauge, GraduationCap, Headphones, Info,
  LockKeyhole, MapPin, MessageSquareText, Play, QrCode, Radio, Rocket, ScanLine,
  ShieldCheck, Sparkles, Target, Trophy, Users, Wifi, WifiOff, Zap,
} from "lucide-react";
import { agents, missions, roles, voiceScripts, xpRules, type Mission, type Role } from "../data";
import { attachProofMedia, createProofRecord, getProofs, missionCopilot, shareCertificate, speak, startProofRecord, trackEvent } from "../platform";
import { useAMX, useSelectedAgent } from "../AppContext";
import {
  AgentCard, AgentGlyph, Metric, MissionCard, PageHeader, ProofStatus, QRCodeCard,
  SponsorBanner, StatusPill, VoiceIndicator, XPBar,
} from "../components";
import { useGeoAnchors } from "../geospatial";
import { recordActivePartnerCampaignEvent } from "../partner-platform";
import { recordCampaignEvent } from "../operations";

const ARScene = lazy(() => import("../ARScene").then((module) => ({ default: module.ARScene })));
const BrandScene = lazy(() => import("../BrandScene").then((module) => ({ default: module.BrandScene })));

export function HomePage() {
  const navigate = useNavigate();
  const { activeMission, role, xp, badges } = useAMX();
  const agent = agents.find((item)=>item.id===activeMission.agentId) || agents[0];
  return <div className="home-page">
    <section className="cockpit-hero">
      <img className="hero-brand-art" src="/brand/amx-air-hubs-brand.png" alt="" aria-hidden="true"/>
      <div className="hero-grid" aria-hidden="true"/><div className="orbit orbit-one" aria-hidden="true"/><div className="orbit orbit-two" aria-hidden="true"/>
      <div className="hero-content">
        <div className="system-status"><span className="live-dot"/>AMX RUNWAY ONLINE <i/> {navigator.onLine ? "NETWORK READY" : "OFFLINE MODE"}</div>
        <h1><span>AMX AIR</span> HUBS</h1>
        <p>Your phone is the cockpit. An AI agent guides the mission. Every completed run becomes proof you can carry forward.</p>
        <div className="experience-modes"><span><CircleUserRound/>Solo</span><span><Users/>Co-op</span><span><ShieldCheck/>Teams</span></div>
        <div className="hero-actions">
          <button className="button primary large" onClick={()=>navigate(`/play/${activeMission.id}`)}><ScanLine/>Choose experience mode</button>
          <button className="button secondary large" onClick={()=>navigate("/missions")}><Compass/>Explore runway</button>
        </div>
        <div className="hero-proof"><ShieldCheck/><div><b>OPPRRC proof enabled</b><span>Organization / Program / Project / Resource / Report / Certificate</span></div></div>
      </div>
      <div className="hero-agent" style={{"--agent":agent.color} as React.CSSProperties}>
        <div className="hero-agent-label"><span className="eyebrow">BLENDER / WEBGPU CORE</span><b>AMX SPATIAL MARK</b></div>
        <Suspense fallback={<div className="scene-loading" aria-label="Loading Blender scene"/>}><BrandScene/></Suspense>
        <div className="agent-transmission"><span className="signal-bars"><i/><i/><i/><i/></span><p>{agent.name} is online. Solo, co-op, and team rooms are ready.</p></div>
      </div>
      <div className="hero-console">
        <div><span>ROLE</span><b>{role}</b></div><div><span>ACTIVE MISSION</span><b>{activeMission.title}</b></div><div><span>RUNWAY LEVEL</span><b>{Math.floor(xp/500)+1}</b></div>
      </div>
    </section>

    <section className="home-runway section-wrap">
      <div className="section-heading"><div><span className="eyebrow">YOUR NEXT RUN</span><h2>Continue from the cockpit</h2></div><Link to="/missions">All missions <ArrowRight size={16}/></Link></div>
      <div className="runway-layout">
        <article className="featured-run">
          <div className="featured-index">01</div><div className="featured-copy"><StatusPill tone="cyan">READY</StatusPill><span className="eyebrow">{activeMission.domain}</span><h3>{activeMission.title}</h3><p>{activeMission.objective}</p><div className="feature-stats"><span><Clock3/> {activeMission.duration}</span><span><Zap/> {activeMission.xp} XP</span><span><Trophy/> {activeMission.badge}</span></div><button className="button primary" onClick={()=>navigate(`/mission/${activeMission.id}/pre`)}>Begin Pre Run <ArrowRight size={17}/></button></div>
          <div className="featured-steps">{["Pre Run","Pro Run","Post Run"].map((label,index)=><div key={label}><b>0{index+1}</b><span>{label}</span><i/></div>)}</div>
        </article>
        <aside className="pilot-card"><div className="pilot-card-head"><span className="eyebrow">PILOT PROFILE</span><StatusPill tone="green">ACTIVE</StatusPill></div><XPBar value={xp}/><div className="pilot-stat-row"><div><strong>{badges.length}</strong><span>BADGES</span></div><div><strong>{getProofs().length}</strong><span>PROOFS</span></div><div><strong>{missions.length}</strong><span>MISSIONS</span></div></div><Link to="/wallet" className="button ghost full">Open proof wallet <ChevronRight size={16}/></Link></aside>
      </div>
    </section>

    <section className="signal-band"><div className="section-wrap signal-grid"><Metric label="Verified runs" value="812" delta="+14% this month" icon={BadgeCheck}/><Metric label="Learners reached" value="2,210" delta="Across 7 partners" icon={Users}/><Metric label="Proof sync" value="99.8%" delta="Local-first queue" icon={Wifi}/><Metric label="Agent uptime" value="24/7" delta="Five guides online" icon={Bot}/></div></section>
    <section className="section-wrap quick-launch"><div className="section-heading"><div><span className="eyebrow">ONE QR / ONE MISSION</span><h2>Launch from anywhere</h2></div></div><div className="quick-grid"><QRCodeCard route="/scan/xrt-green-mode" title="XRT Green Mode"/><div className="quick-copy"><QrCode size={30}/><h3>Turn every surface into a runway</h3><p>Cards, event signs, classrooms, sponsor activations, and learner badges can launch the exact role, agent, and mission they need.</p><div className="route-chips"><code>/scan/mission</code><code>/sponsor/partner</code><code>/scan/event</code></div></div></div></section>
  </div>;
}

export function RoleSelectPage() {
  const navigate=useNavigate();const {role,setRole}=useAMX();
  const icons={Learner:GraduationCap,Earner:CircleDollarSign,Trainer:Users,Sponsor:Rocket,Admin:Gauge};
  return <div className="page section-wrap"><PageHeader eyebrow="IDENTIFY YOUR RUN" title="Choose your cockpit role" description="Your role changes the mission path, agent guidance, proof fields, and next action."/>
    <div className="role-grid">{roles.map((item)=>{const Icon=icons[item.id];return <button key={item.id} className={`role-card ${role===item.id?"selected":""}`} onClick={()=>setRole(item.id)}><span className="role-icon"><Icon/></span><div><span className="eyebrow">{item.id.toUpperCase()} MODE</span><h3>{item.title}</h3><p>{item.description}</p><b>{item.cta}<ArrowRight size={15}/></b></div>{role===item.id&&<BadgeCheck className="role-check"/>}</button>})}</div>
    <div className="sticky-action"><span><ShieldCheck/>Role can be changed before any mission.</span><button className="button primary" onClick={()=>navigate("/dashboard")}>Continue as {role}<ArrowRight/></button></div>
  </div>;
}

export function MissionsPage() {
  const navigate=useNavigate();const {role,setActiveMissionId}=useAMX();const [filter,setFilter]=useState("All");
  const domains=["All",...new Set(missions.map((mission)=>mission.domain))];
  const visible=missions.filter((mission)=>(filter==="All"||mission.domain===filter)&&(mission.roles.includes(role)||role==="Admin"));
  return <div className="page section-wrap"><PageHeader eyebrow="MISSION RUNWAY" title="Choose your next run" description={`Showing missions configured for ${role} mode.`} actions={<Link to="/role" className="button secondary"><Users/>Change role</Link>}/>
    <div className="filter-row">{domains.map((domain)=><button key={domain} className={filter===domain?"active":""} onClick={()=>setFilter(domain)}>{domain}</button>)}</div>
    <div className="mission-grid">{visible.map((mission)=><MissionCard key={mission.id} mission={mission} onOpen={()=>{setActiveMissionId(mission.id);navigate(`/mission/${mission.id}/pre`)}}/>)}</div>
  </div>;
}

export function AgentsPage() {
  const {selectedAgentId,setSelectedAgentId,xp}=useAMX();const selected=agents.find((agent)=>agent.id===selectedAgentId)||agents[0];
  return <div className="page section-wrap"><PageHeader eyebrow="AGENT REGISTRY" title="Choose your co-pilot" description="Each AMX guide has a distinct mission specialty, voice, and spatial identity."/>
    <div className="agent-selector-layout"><div className="agent-grid">{agents.map((agent)=><AgentCard key={agent.id} agent={agent} active={agent.id===selectedAgentId} locked={xp<agent.unlockAtXP} onSelect={()=>setSelectedAgentId(agent.id)}/>)}</div>
    <aside className="agent-profile" style={{"--agent":selected.color} as React.CSSProperties}><div className="profile-visual"><AgentGlyph agent={selected}/><div className="profile-rings"/></div><StatusPill tone="green">ONLINE</StatusPill><h2>{selected.name}</h2><b>{selected.role}</b><p>{selected.specialty}</p><div className="agent-facts"><span><Headphones/>VOICE <b>{selected.voice}</b></span><span><Target/>MISSIONS <b>{selected.missions.length}</b></span><span><Cpu/>RUNTIME <b>Local + Cloud</b></span></div><div className="agent-profile-actions"><Link to={`/agents/${selected.id}/workspace`} className="button primary full"><Sparkles/>Open toolbelt</Link><Link to={`/agents/${selected.id}/profile`} className="button secondary full">Agent profile<ArrowRight/></Link></div></aside></div>
  </div>;
}

function getMission(id?:string): Mission {return missions.find((mission)=>mission.id===id)||missions[0]}

export function PreRunPage() {
  const {id}=useParams();const mission=getMission(id);const navigate=useNavigate();const {role,setActiveMissionId,setSelectedAgentId,settings,grantXP}=useAMX();
  const agent=agents.find((item)=>item.id===mission.agentId)||agents[0];
  const [checks,setChecks]=useState({safe:false,camera:false,consent:false});const [eventCode,setEventCode]=useState("");const [trainerApproved,setTrainerApproved]=useState(false);const ready=Object.values(checks).every(Boolean)&&(!settings.youthMode||(eventCode.length>=4&&trainerApproved));
  useEffect(()=>{setActiveMissionId(mission.id);setSelectedAgentId(agent.id);trackEvent("mission_viewed",{missionId:mission.id,role})},[agent.id,mission.id,role,setActiveMissionId,setSelectedAgentId]);
  const toggle=(key:keyof typeof checks)=>setChecks((current)=>({...current,[key]:!current[key]}));
  return <div className="page section-wrap"><Link className="back-link" to="/missions"><ChevronLeft/>Back to missions</Link>
    <div className="pre-layout"><section><PageHeader eyebrow="PRE RUN / SAFETY GATE" title={mission.title} description={mission.objective}/>
      <div className="briefing-card"><div className="briefing-agent"><AgentGlyph agent={agent} size="small"/><div><span className="eyebrow">YOUR GUIDE</span><h3>{agent.name} / {agent.role}</h3><VoiceIndicator enabled={settings.audioEnabled}/></div></div><button className="icon-button" onClick={()=>speak(voiceScripts[agent.id].intro,settings.audioEnabled)} aria-label="Play briefing"><Play/></button></div>
      <div className="run-details"><div><Clock3/><span>DURATION<b>{mission.duration}</b></span></div><div><Gauge/><span>DIFFICULTY<b>{mission.difficulty}</b></span></div><div><Trophy/><span>REWARD<b>{mission.badge}</b></span></div></div>
      <div className="objective-panel"><Target/><div><span className="eyebrow">LEARNING OBJECTIVE</span><p>{mission.objective}</p></div></div>
    </section>
    <aside className="safety-panel"><span className="eyebrow">CLEAR FOR LAUNCH</span><h2>Safety and consent</h2><p>Confirm each item before the camera or WebXR session begins.</p>
      <div className="safety-checks">
        <button className={checks.safe?"checked":""} onClick={()=>toggle("safe")}><span>{checks.safe?<Check/>:<MapPin/>}</span><div><b>I am in a safe space</b><small>I will stay aware of people and objects around me.</small></div></button>
        <button className={checks.camera?"checked":""} onClick={()=>toggle("camera")}><span>{checks.camera?<Check/>:<Camera/>}</span><div><b>I understand camera access</b><small>The camera maps the scene; AMX does not upload video.</small></div></button>
        <button className={checks.consent?"checked":""} onClick={()=>toggle("consent")}><span>{checks.consent?<Check/>:<ShieldCheck/>}</span><div><b>I agree to continue</b><small>Mission progress and proof metadata will be saved locally.</small></div></button>
      </div>
      {settings.youthMode&&<div className="youth-gate"><LockKeyhole/><div><span className="eyebrow">YOUTH MODE</span><b>Trainer authorization required</b><p>Enter the event code and confirm a supervising trainer is present.</p><div><input value={eventCode} onChange={(event)=>setEventCode(event.target.value.toUpperCase())} maxLength={8} placeholder="EVENT CODE"/><label><input type="checkbox" checked={trainerApproved} onChange={(event)=>setTrainerApproved(event.target.checked)}/> Trainer approved</label></div></div></div>}
      <div className="device-check"><div><SmartStatus online={navigator.onLine}/><span>NETWORK<b>{navigator.onLine?"Online":"Offline queue"}</b></span></div><div><Cpu/><span>DEVICE<b>WebXR fallback ready</b></span></div></div>
      <button disabled={!ready} className="button primary large full" onClick={()=>{const campaignId=localStorage.getItem("amx_active_campaign")||undefined;const locationTag=localStorage.getItem("amx_active_location")||undefined;startProofRecord(mission,role);grantXP(xpRules.startMission);trackEvent("mission_started",{missionId:mission.id,role,campaignId,locationTag});if(campaignId)recordCampaignEvent(campaignId,"starts");void recordActivePartnerCampaignEvent("start",mission.id);navigate(`/mission/${mission.id}/run`)}}><Play/>Enter mission</button>
      {!ready&&<small className="gate-note"><Info/>Complete all three confirmations to continue.</small>}
    </aside></div><SponsorBanner/>
  </div>;
}
function SmartStatus({online}:{online:boolean}){return online?<Wifi/>:<WifiOff/>}

export function MissionRunPage() {
  const {id}=useParams();const mission=getMission(id);const navigate=useNavigate();const {role,settings,grantXP,setLatestProof,refreshRewards}=useAMX();
  const geo=useGeoAnchors(`MISSION-${mission.id}`);
  const agent=agents.find((item)=>item.id===mission.agentId)||agents[0];const [placed,setPlaced]=useState(false);const [step,setStep]=useState(0);const [copilotOpen,setCopilotOpen]=useState(false);const [question,setQuestion]=useState("");const [answer,setAnswer]=useState("");const [quizOpen,setQuizOpen]=useState(false);const [quizAnswer,setQuizAnswer]=useState<number|null>(null);const [quizMessage,setQuizMessage]=useState("");const [evidenceSaved,setEvidenceSaved]=useState(false);const startedAt=useRef(Date.now());const placeGranted=useRef(false);
  const onPlaced=useCallback(()=>{setPlaced(true);if(!placeGranted.current){placeGranted.current=true;grantXP(xpRules.placeAgent);speak(voiceScripts[agent.id].placeAgent,settings.audioEnabled);trackEvent("agent_placed",{missionId:mission.id,role})}},[agent.id,grantXP,mission.id,role,settings.audioEnabled]);
  const current=mission.steps[step];const progress=((step+(placed?1:0))/(mission.steps.length+1))*100;
  const finish=()=>{grantXP(xpRules.finishMission);const proof=createProofRecord(mission,role,mission.xp+(quizAnswer===mission.quiz.correct?xpRules.bonusQuiz:0),startedAt.current);const campaignId=localStorage.getItem("amx_active_campaign");if(campaignId)recordCampaignEvent(campaignId,"completions");void recordActivePartnerCampaignEvent("completion",mission.id);setLatestProof(proof);refreshRewards();speak(voiceScripts[agent.id].complete,settings.audioEnabled);navigate(`/mission/${mission.id}/complete`)};
  const advance=()=>{if(step<mission.steps.length-1){grantXP(current.xp);trackEvent("checkpoint_completed",{missionId:mission.id,role});setStep(step+1);speak(mission.steps[step+1].prompt,settings.audioEnabled)}else{setQuizOpen(true)}};
  const captureEvidence=()=>{const canvas=document.querySelector<HTMLCanvasElement>(".xr-canvas");const proofId=localStorage.getItem("amx_active_proof");if(!canvas||!proofId)return;attachProofMedia(proofId,canvas.toDataURL("image/jpeg",0.55));setEvidenceSaved(true);trackEvent("media_proof_captured",{missionId:mission.id,role})};
  const submitQuiz=()=>{if(quizAnswer===null)return;if(quizAnswer===mission.quiz.correct){grantXP(xpRules.bonusQuiz);setQuizMessage("Correct. Bonus XP secured.");setTimeout(finish,650)}else{setQuizMessage("Not quite. Review the checkpoint and try again.")}};
  return <div className="mission-run">
    <div className="run-topbar"><Link to={`/mission/${mission.id}/pre`} className="icon-button" aria-label="Exit mission"><XIcon/></Link><div><span className="eyebrow">PRO RUN / {mission.title}</span><div className="step-progress"><span style={{width:`${progress}%`}}/></div></div><span className="run-xp"><Zap/>+{placed?xpRules.placeAgent:0} XP</span></div>
    <div className="run-stage"><Suspense fallback={<div className="scene-loading" aria-label="Loading AR scene"/>}><ARScene agent={agent} onPlaced={onPlaced} onSessionStart={geo.requestLocation} anchors={geo.projectedAnchors} onAnchorPlaced={(placement)=>geo.publishAnchor({label:`${agent.name} mission anchor`,...placement,source:placement.source})} textOnly={settings.textOnlyMode}/></Suspense>
      <aside className="mission-panel"><div className="mission-panel-agent"><AgentGlyph agent={agent} size="small"/><div><span className="eyebrow">{agent.name} TRANSMISSION</span><VoiceIndicator enabled={settings.audioEnabled}/></div></div>
        {!placed?<div className="placement-copy"><ScanLine/><h2>Place {agent.name}</h2><p>Enter AR or tap the preview field to anchor your guide. Keep the area around you clear.</p><span className="pulse-label"><i/>WAITING FOR PLACEMENT</span></div>:<>
          <div className="checkpoint-count"><span>CHECKPOINT {step+1} OF {mission.steps.length}</span><b>{String(step+1).padStart(2,"0")}</b></div>
          <h2>{current.title}</h2><p>{current.body}</p><div className="agent-prompt"><MessageSquareText/><p>{current.prompt}</p></div>
          <button className="button primary large full" onClick={advance} disabled={quizOpen}>{step===mission.steps.length-1?"Open bonus quiz":"Complete checkpoint"}<CheckCircle2/></button>
          <button className="button secondary full" onClick={captureEvidence}><Camera/>{evidenceSaved?"Evidence attached":"Capture proof frame"}</button>
          <button className="button ghost full" onClick={()=>setCopilotOpen(!copilotOpen)}><Sparkles/>Ask {agent.name}</button>
          {quizOpen&&<div className="quiz-panel"><span className="eyebrow">BONUS CHECKPOINT / +{xpRules.bonusQuiz} XP</span><h3>{mission.quiz.question}</h3>{mission.quiz.options.map((option,index)=><button key={option} className={quizAnswer===index?"selected":""} onClick={()=>{setQuizAnswer(index);setQuizMessage("")}}><span>{String.fromCharCode(65+index)}</span>{option}</button>)}{quizMessage&&<p>{quizMessage}</p>}<button className="button primary full" onClick={submitQuiz} disabled={quizAnswer===null}>Submit answer<ArrowRight/></button></div>}
          {copilotOpen&&<div className="copilot-box"><div><input value={question} onChange={(event)=>setQuestion(event.target.value)} placeholder="Ask about this step..." onKeyDown={(event)=>{if(event.key==="Enter")setAnswer(missionCopilot(question,mission,step))}}/><button type="button" aria-label={`Send question to ${agent.name}`} title={`Send question to ${agent.name}`} onClick={()=>setAnswer(missionCopilot(question,mission,step))}><ArrowRight/></button></div>{answer&&<p>{answer}</p>}</div>}
        </>}
      </aside>
    </div>
  </div>;
}
function XIcon(){return <ChevronLeft/>}

export function CompletePage() {
  const {id}=useParams();const mission=getMission(id);const {latestProof,xp}=useAMX();const proof=latestProof||getProofs().find((item)=>item.missionId===mission.id);
  if(!proof)return <div className="page section-wrap"><PageHeader eyebrow="POST RUN" title="No completed run found"/><Link to={`/mission/${mission.id}/pre`} className="button primary">Start mission</Link></div>;
  return <div className="complete-page"><div className="complete-rays" aria-hidden="true"/><section className="complete-hero section-wrap"><div className="badge-earned"><div className="badge-orbit"/><div className="badge-core"><Trophy/><span>AMX</span></div></div><span className="eyebrow">POST RUN / MISSION COMPLETE</span><h1>{mission.badge}</h1><p>You completed {mission.title}. Your badge, certificate, report, and OPPRRC proof are ready.</p><div className="completion-actions"><button className="button primary large" onClick={()=>shareCertificate(proof)}><BadgeCheck/>Share certificate</button><Link className="button secondary large" to="/wallet">Open proof wallet</Link></div></section>
    <section className="post-summary section-wrap"><div className="summary-score"><span>MISSION SCORE</span><strong>{proof.report.score}</strong><i>/100</i><div className="score-ring" style={{"--score":`${proof.report.score*3.6}deg`} as React.CSSProperties}/></div><div className="summary-stats"><Metric label="XP awarded" value={`+${proof.report.xp}`} icon={Zap}/><Metric label="Run time" value={`${Math.round(proof.report.durationSeconds/60)} min`} icon={Clock3}/><Metric label="Proof status" value="Verified" icon={ShieldCheck}/></div><div className="proof-receipt"><div><span className="eyebrow">OPPRRC PROOF RECEIPT</span><ProofStatus status={proof.syncStatus==="queued"?"Queued offline":"Verified"}/></div><dl><div><dt>Organization</dt><dd>{proof.org}</dd></div><div><dt>Program</dt><dd>{proof.program}</dd></div><div><dt>Project</dt><dd>{proof.project}</dd></div><div><dt>Proof ID</dt><dd>{proof.id}</dd></div></dl></div></section>
    <section className="next-band"><div className="section-wrap"><div><span className="eyebrow">THE NEXT DOOR</span><h2>Keep moving down the runway</h2></div><Link className="button primary" to="/marketplace">Enter marketplace<ArrowRight/></Link></div></section>
  </div>;
}

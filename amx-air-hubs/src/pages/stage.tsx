import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Armchair, Bot, Camera, ChevronRight, CircleStop, Clapperboard, Crown, Film, Link2,
  Megaphone, Minus, MonitorPlay, Plus, Radio, RefreshCw, Sparkles, Ticket, Users, Video, Wifi,
} from "lucide-react";
import { agents } from "../data";
import { trackEvent } from "../platform";
import { useAMX } from "../AppContext";
import {
  DEFAULT_SPONSORS, useStageProduction, type SponsorCreative, type StageCue, type StageMode, type StageShot,
} from "../stage-production";

const AMXXRStageScene = lazy(async () => ({ default: (await import("../AMXXRStageScene")).AMXXRStageScene }));
const LiveKitPod = lazy(async () => ({ default: (await import("../LiveKitPod")).LiveKitPod }));

type ConsoleView = "production" | "collab" | "audience" | "sponsors";

const SHOTS: Array<{ id: StageShot; label: string; detail: string; icon: typeof Camera }> = [
  { id: "wide", label: "CAM 1", detail: "Stage wide", icon: Video },
  { id: "host", label: "CAM 2", detail: "Host close", icon: Camera },
  { id: "audience", label: "CAM 3", detail: "Audience reverse", icon: Users },
  { id: "crane", label: "CRANE", detail: "Venue sweep", icon: Film },
];

const CUES: Array<{ id: StageCue; label: string }> = [
  { id: "standby", label: "Standby" },
  { id: "opening", label: "Opening" },
  { id: "speaker", label: "Speaker" },
  { id: "demo", label: "Demo" },
  { id: "qa", label: "Q&A" },
  { id: "sponsor", label: "Sponsor" },
  { id: "close", label: "Close" },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function AMXXRStagePage() {
  const { settings } = useAMX();
  const [view, setView] = useState<ConsoleView>("production");
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("amx_stage_room") || "AMXSTAGE");
  const production = useStageProduction(roomCode);
  const [streams, setStreams] = useState<MediaStream[]>([]);
  const [backend, setBackend] = useState<"initializing" | "webgpu" | "webgl2">("initializing");
  const [podDraft, setPodDraft] = useState("");
  const [autoSponsor, setAutoSponsor] = useState(false);
  const [customSponsors, setCustomSponsors] = useState<SponsorCreative[]>(() => {
    try { return JSON.parse(localStorage.getItem("amx_stage_sponsors") || "[]") as SponsorCreative[]; }
    catch { return []; }
  });
  const [sponsorDraft, setSponsorDraft] = useState({ name: "", headline: "", cta: "VISIT THE SPONSOR", accent: "#55e6ff" });
  const inventory = useMemo(() => [...DEFAULT_SPONSORS, ...customSponsors], [customSponsors]);
  const crew = agents.slice(0, 4);

  const changeRoom = (value: string) => {
    const safe = value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
    setRoomCode(safe);
    localStorage.setItem("amx_stage_room", safe);
  };
  const setMode = (mode: StageMode) => {
    production.update({ mode });
    trackEvent("stage_mode_changed", { locationTag: production.room });
  };
  const takeShot = (shot: StageShot) => {
    production.update({ shot });
    trackEvent("stage_camera_taken", { locationTag: production.room });
  };
  const fireCue = (cue: StageCue) => {
    const patch: Parameters<typeof production.update>[0] = { cue };
    if (cue === "sponsor") patch.sponsor = inventory[(inventory.findIndex((item) => item.id === production.state.sponsor.id) + 1) % inventory.length];
    production.update(patch);
    trackEvent("stage_cue_fired", { campaignId: cue === "sponsor" ? patch.sponsor?.id : undefined, locationTag: production.room });
  };
  const toggleLive = () => {
    const live = !production.state.live;
    production.update({ live, cue: live ? "opening" : "close", shot: live ? "wide" : production.state.shot });
    trackEvent(live ? "stage_show_started" : "stage_show_ended", { campaignId: production.state.sponsor.id, locationTag: production.room });
  };
  const linkPod = () => {
    const pod = podDraft.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
    if (!pod || production.state.connectedPods.includes(pod)) return;
    production.update({ connectedPods: [...production.state.connectedPods, pod].slice(-8) });
    setPodDraft("");
    trackEvent("stage_pod_linked", { locationTag: pod });
  };
  const unlinkPod = (pod: string) => production.update({ connectedPods: production.state.connectedPods.filter((item) => item !== pod) });
  const addSponsor = () => {
    if (!sponsorDraft.name.trim() || !sponsorDraft.headline.trim()) return;
    const sponsor: SponsorCreative = { ...sponsorDraft, id: `sponsor-${crypto.randomUUID().slice(0, 8)}`, name: sponsorDraft.name.trim(), headline: sponsorDraft.headline.trim(), cta: sponsorDraft.cta.trim() || "VISIT THE SPONSOR" };
    const next = [...customSponsors, sponsor].slice(-12);
    setCustomSponsors(next);
    localStorage.setItem("amx_stage_sponsors", JSON.stringify(next));
    production.update({ sponsor, cue: "sponsor" });
    setSponsorDraft({ name: "", headline: "", cta: "VISIT THE SPONSOR", accent: "#55e6ff" });
    trackEvent("stage_sponsor_created", { campaignId: sponsor.id, locationTag: production.room });
  };
  const selectSponsor = useCallback((sponsor: SponsorCreative) => {
    production.update({ sponsor, cue: "sponsor" });
    trackEvent("stage_sponsor_impression", { campaignId: sponsor.id, locationTag: production.room });
  }, [production]);

  useEffect(() => {
    if (!autoSponsor || !production.state.live || inventory.length < 2) return;
    const timer = window.setInterval(() => {
      const index = inventory.findIndex((item) => item.id === production.state.sponsor.id);
      selectSponsor(inventory[(index + 1) % inventory.length]);
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [autoSponsor, inventory, production.state.live, production.state.sponsor.id, selectSponsor]);

  const seatsTotal = production.state.generalSeats + production.state.vipSeats;
  return <div className="page amx-stage-page">
    <header className="stage-workspace-bar">
      <div className="stage-title"><span className="eyebrow">AMX XR STAGE / LIVE PRODUCTION</span><h1>Show control</h1></div>
      <div className="stage-show-status"><span className={production.state.live ? "live" : "ready"}><i/>{production.state.live ? "ON AIR" : "READY"}</span><span><Camera/>{production.state.shot.toUpperCase()}</span><span><Users/>{seatsTotal} seated</span><span><Link2/>{production.state.connectedPods.length} pods</span><span><Wifi/>{production.transport}</span></div>
      <button className={`stage-live-button ${production.state.live ? "end" : ""}`} onClick={toggleLive}>{production.state.live ? <CircleStop/> : <Radio/>}{production.state.live ? "END SHOW" : "GO LIVE"}</button>
    </header>

    <div className="stage-command-layout">
      <section className="stage-scene-band">
        <Suspense fallback={<div className="nexus-scene-loading"><span/><b>Preparing AMX XR Stage</b></div>}><AMXXRStageScene mode={production.state.mode} shot={production.state.shot} sponsor={production.state.sponsor} generalSeats={production.state.generalSeats} vipSeats={production.state.vipSeats} live={production.state.live} streams={streams} reducedMotion={settings.reducedMotion} onBackend={setBackend}/></Suspense>
        <div className="stage-scene-overlay"><div><span className="eyebrow">{production.state.mode.toUpperCase()} / {backend === "webgpu" ? "WEBGPU" : backend === "webgl2" ? "WEBGL2" : "GPU INIT"}</span><b>AMX XR STAGE</b><small>{production.state.cue.toUpperCase()} / {production.state.sponsor.name}</small></div><div className="stage-seat-tally"><Crown/><span>VIP <b>{production.state.vipSeats}/8</b></span><i/><Armchair/><span>HOUSE <b>{production.state.generalSeats}/36</b></span></div></div>
      </section>

      <aside className="stage-console">
        <div className="stage-console-tabs" role="tablist" aria-label="Stage console">{([
          ["production", "Show", Clapperboard], ["collab", "Pods", Radio], ["audience", "Seats", Ticket], ["sponsors", "Ads", Megaphone],
        ] as const).map(([id, label, Icon]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon/><span>{label}</span></button>)}</div>
        <div className="stage-console-body">
          <div className="stage-console-view" hidden={view !== "production"}>
            <section className="stage-control-section"><header><div><span className="eyebrow">VENUE MODE</span><h2>Audience format</h2></div><span className="stage-sync-state"><i/>{production.peerCount} operator{production.peerCount === 1 ? "" : "s"}</span></header><div className="stage-mode-control">{(["in-person", "online", "metaverse"] as StageMode[]).map((mode) => <button key={mode} className={production.state.mode === mode ? "active" : ""} onClick={() => setMode(mode)}>{mode}</button>)}</div></section>
            <section className="stage-control-section"><header><div><span className="eyebrow">PROGRAM CAMERA</span><h2>Take shot</h2></div><span className={production.state.live ? "camera-tally live" : "camera-tally"}><i/>PGM</span></header><div className="stage-shot-grid">{SHOTS.map(({ id, label, detail, icon: Icon }) => <button key={id} className={production.state.shot === id ? "active" : ""} onClick={() => takeShot(id)}><Icon/><span><b>{label}</b><small>{detail}</small></span><i/></button>)}</div></section>
            <section className="stage-control-section"><header><div><span className="eyebrow">SHOW CUES</span><h2>Run of show</h2></div><b className="stage-current-cue">{production.state.cue}</b></header><div className="stage-cue-grid">{CUES.map((cue) => <button key={cue.id} className={production.state.cue === cue.id ? "active" : ""} onClick={() => fireCue(cue.id)}><span>{cue.label}</span><ChevronRight/></button>)}</div></section>
          </div>

          <div className="stage-console-view" hidden={view !== "collab"}>
            <section className="stage-control-section"><header><div><span className="eyebrow">CROSS-POD CONNECTION</span><h2>Linked showcases</h2></div><span className="stage-sync-state"><i/>{production.transport}</span></header><label className="stage-room-field">Stage room<input value={roomCode} onChange={(event) => changeRoom(event.target.value)}/></label><div className="stage-pod-link"><input value={podDraft} onChange={(event) => setPodDraft(event.target.value)} placeholder="POD CODE"/><button onClick={linkPod} disabled={!podDraft.trim()}><Link2/>Link</button></div><div className="stage-pod-list">{production.state.connectedPods.map((pod) => <div key={pod}><span><i/><b>{pod}</b><small>stage cue bus linked</small></span><button onClick={() => unlinkPod(pod)} aria-label={`Unlink ${pod}`} title={`Unlink ${pod}`}><Minus/></button></div>)}</div></section>
            <Suspense fallback={<div className="pod-camera-off"><Radio/><span>Preparing stage media</span></div>}><LiveKitPod compact roomCode={production.room} agents={crew} onSceneStreams={setStreams}/></Suspense>
          </div>

          <div className="stage-console-view" hidden={view !== "audience"}>
            <section className="stage-control-section"><header><div><span className="eyebrow">HOUSE MANAGEMENT</span><h2>Pod seating</h2></div><b className="stage-seat-total">{seatsTotal}/44</b></header><div className="stage-seat-control"><div><Crown/><span><b>VIP / sponsor</b><small>Front-row reserved seats</small></span><output>{production.state.vipSeats}</output></div><input type="range" min="0" max="8" value={production.state.vipSeats} onChange={(event) => production.update({ vipSeats: Number(event.target.value) })}/><div className="seat-stepper"><button onClick={() => production.update({ vipSeats: clamp(production.state.vipSeats - 1, 0, 8) })} aria-label="Remove VIP seat"><Minus/></button><button onClick={() => production.update({ vipSeats: clamp(production.state.vipSeats + 1, 0, 8) })} aria-label="Add VIP seat"><Plus/></button></div></div><div className="stage-seat-control"><div><Armchair/><span><b>General house</b><small>In-person and avatar seats</small></span><output>{production.state.generalSeats}</output></div><input type="range" min="0" max="36" value={production.state.generalSeats} onChange={(event) => production.update({ generalSeats: Number(event.target.value) })}/><div className="seat-stepper"><button onClick={() => production.update({ generalSeats: clamp(production.state.generalSeats - 1, 0, 36) })} aria-label="Remove general seat"><Minus/></button><button onClick={() => production.update({ generalSeats: clamp(production.state.generalSeats + 1, 0, 36) })} aria-label="Add general seat"><Plus/></button></div></div></section>
            <section className="stage-audience-map"><div className="stage-map-stage">STAGE</div><div className="stage-map-vip">{Array.from({ length: 8 }, (_, index) => <i key={index} className={index < production.state.vipSeats ? "filled" : ""}/>)}</div><div className="stage-map-house">{Array.from({ length: 36 }, (_, index) => <i key={index} className={index < production.state.generalSeats ? "filled" : ""}/>)}</div></section>
          </div>

          <div className="stage-console-view" hidden={view !== "sponsors"}>
            <section className="stage-control-section"><header><div><span className="eyebrow">SPONSOR AD SERVER</span><h2>On-air inventory</h2></div><label className="stage-auto-ads"><input type="checkbox" checked={autoSponsor} onChange={(event) => setAutoSponsor(event.target.checked)}/><i/><span>AUTO</span></label></header><div className="stage-sponsor-list">{inventory.map((sponsor) => <button key={sponsor.id} className={production.state.sponsor.id === sponsor.id ? "active" : ""} onClick={() => selectSponsor(sponsor)} style={{ "--sponsor-accent": sponsor.accent } as React.CSSProperties}><i/><span><b>{sponsor.name}</b><small>{sponsor.headline}</small></span><MonitorPlay/></button>)}</div></section>
            <section className="stage-control-section stage-creative-builder"><header><div><span className="eyebrow">CREATIVE</span><h2>Add sponsor slate</h2></div><Sparkles/></header><label>Name<input value={sponsorDraft.name} onChange={(event) => setSponsorDraft((current) => ({ ...current, name: event.target.value }))} maxLength={30}/></label><label>Headline<input value={sponsorDraft.headline} onChange={(event) => setSponsorDraft((current) => ({ ...current, headline: event.target.value }))} maxLength={58}/></label><div><label>Call to action<input value={sponsorDraft.cta} onChange={(event) => setSponsorDraft((current) => ({ ...current, cta: event.target.value }))} maxLength={42}/></label><label className="stage-color-field">Color<input type="color" value={sponsorDraft.accent} onChange={(event) => setSponsorDraft((current) => ({ ...current, accent: event.target.value }))}/></label></div><button className="button secondary full" onClick={addSponsor} disabled={!sponsorDraft.name.trim() || !sponsorDraft.headline.trim()}><Plus/>Add and take to air</button></section>
          </div>
        </div>
      </aside>
    </div>
  </div>;
}

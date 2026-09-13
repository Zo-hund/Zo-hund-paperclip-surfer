import { useEffect, useState } from "react";
import { AudioLines, Gauge, Lightbulb, Radio, ShieldCheck, Sparkles, WandSparkles, Zap } from "lucide-react";
import {
  STAGE_LIGHTING_LOOKS,
  STAGE_SCORE_PRESETS,
  STAGE_VFX_LOOKS,
  stageScoreClock,
  type StageAudioState,
  type StageLightingLook,
  type StageScoreCue,
  type StageScoreState,
  type StageSoundDesign,
  type StageVfxLook,
} from "./stage-audio";

interface Props {
  audio: StageAudioState;
  currentCue: StageScoreCue;
  onUpdate: (patch: Partial<StageScoreState>) => void;
  onFire: (cue: StageScoreCue) => Promise<void>;
}

const SOUND_DESIGNS: Array<{ id: StageSoundDesign; label: string }> = [
  { id: "none", label: "No transition" },
  { id: "impact", label: "Low impact" },
  { id: "riser", label: "AMX riser" },
  { id: "pulse", label: "Beat pulse" },
  { id: "sparkle", label: "Prism sparkle" },
];

export function StageScoreDesigner({ audio, currentCue, onUpdate, onFire }: Props) {
  const [now, setNow] = useState(Date.now());
  const [firing, setFiring] = useState<StageScoreCue | null>(null);
  const score = audio.score;
  const clock = stageScoreClock(audio.bpm, score.firedAt || audio.startedAt, now);

  useEffect(() => {
    if (!score.armed || !score.beatSync) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [score.armed, score.beatSync]);

  const fire = async (cue: StageScoreCue) => {
    if (!score.armed || firing) return;
    setFiring(cue);
    try { await onFire(cue); }
    finally { setFiring(null); }
  };

  return <section className="stage-control-section stage-score-designer">
    <header>
      <div><span className="eyebrow">SHOW SCORE</span><h2>Music sync, lights and VFX</h2></div>
      <span className={`stage-sync-state ${score.armed ? "score-armed" : ""}`}><i/>{score.armed ? "ARMED" : "SAFE"}</span>
    </header>

    <div className="stage-score-master">
      <button className={score.armed ? "armed" : ""} onClick={() => onUpdate({ armed: !score.armed })} aria-pressed={score.armed}>
        <Zap/><span>{score.armed ? "DISARM SCORE" : "ARM SCORE"}</span>
      </button>
      <div className="stage-score-clock" aria-label={`Bar ${clock.bar}, beat ${clock.beat}`}>
        <span><b>{String(clock.bar).padStart(2, "0")}</b><small>BAR</small></span>
        <div>{[1, 2, 3, 4].map((beat) => <i key={beat} className={clock.beat === beat && score.armed ? "active" : ""}/>)}</div>
        <span><b>{clock.beat}</b><small>BEAT</small></span>
      </div>
    </div>

    <div className="stage-score-modes">
      <div role="group" aria-label="Score mode">
        <button className={score.mode === "manual" ? "active" : ""} onClick={() => onUpdate({ mode: "manual" })}>MANUAL</button>
        <button className={score.mode === "cue-follow" ? "active" : ""} onClick={() => onUpdate({ mode: "cue-follow" })}><Radio/>CUE FOLLOW</button>
      </div>
      <button className={score.beatSync ? "active" : ""} onClick={() => onUpdate({ beatSync: !score.beatSync })} aria-pressed={score.beatSync}><AudioLines/>BEAT SYNC</button>
    </div>

    <div className="stage-score-block">
      <label><Lightbulb/>LIGHTING LOOK</label>
      <div className="stage-score-look-grid">{STAGE_LIGHTING_LOOKS.map((look) => <button key={look.id} className={score.lighting === look.id ? "active" : ""} onClick={() => onUpdate({ lighting: look.id as StageLightingLook, activeCue: null })}><i/><span>{look.label}</span></button>)}</div>
    </div>

    <div className="stage-score-block">
      <label><WandSparkles/>VISUAL DESIGN</label>
      <div className="stage-score-vfx-grid">{STAGE_VFX_LOOKS.map((look) => <button key={look.id} className={score.vfx === look.id ? "active" : ""} onClick={() => onUpdate({ vfx: look.id as StageVfxLook, activeCue: null })}><Sparkles/><span>{look.label}</span></button>)}</div>
    </div>

    <div className="stage-score-mix">
      <label><span><Gauge/>INTENSITY <b>{score.intensity}%</b></span><input type="range" min="0" max="100" value={score.intensity} onChange={(event) => onUpdate({ intensity: Number(event.target.value) })}/></label>
      <label><span><AudioLines/>SOUND DESIGN</span><select value={score.sound} onChange={(event) => onUpdate({ sound: event.target.value as StageSoundDesign })}>{SOUND_DESIGNS.map((design) => <option key={design.id} value={design.id}>{design.label}</option>)}</select></label>
    </div>

    <div className="stage-score-cues">
      <div><span><ShieldCheck/>SAFE SCORE CUES</span><small>{score.mode === "cue-follow" ? "RUNDOWN LINKED" : "MANUAL FIRE"}</small></div>
      <div>{STAGE_SCORE_PRESETS.map((preset) => <button key={preset.cue} disabled={!score.armed || Boolean(firing)} className={score.activeCue === preset.cue ? "active" : currentCue === preset.cue ? "current" : ""} onClick={() => void fire(preset.cue)}><span>{preset.label}</span><small>{preset.lighting} / {preset.vfx}</small>{firing === preset.cue ? <i/> : <Sparkles/>}</button>)}</div>
    </div>
  </section>;
}

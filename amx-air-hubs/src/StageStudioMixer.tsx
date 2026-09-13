import { Headphones, Mic2, Music2, Power, Radio, Volume2, VolumeX, Waves } from "lucide-react";
import type { CaptureState, ProgramAudioState } from "./LiveKitPod";
import type { StageAudioState } from "./stage-audio";

type Props = {
  audio: StageAudioState;
  ambienceLevel: number;
  microphoneState: CaptureState;
  monitorEnabled: boolean;
  monitorStatus: string;
  programAudioState: ProgramAudioState;
  programLevel: number;
  voiceLevel: number;
  onToggleMonitor: () => void | Promise<void>;
  onToggleProgram: () => void | Promise<void>;
  onUpdate: (patch: Partial<StageAudioState>) => void;
};

function Meter({ level, label }: { level: number; label: string }) {
  const safeLevel = Math.max(0, Math.min(1, level));
  return <div className="studio-meter" aria-label={`${label} level ${Math.round(safeLevel * 100)} percent`}><i style={{ height: `${Math.max(3, safeLevel * 100)}%` }}/><span/><span/><span/></div>;
}

function Fader({ label, value, max = 100, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return <label className="studio-fader"><span>{label}<b>{value}</b></span><input aria-label={`${label} level`} type="range" min="0" max={max} value={value} onChange={(event) => onChange(Number(event.target.value))}/></label>;
}

export function StageStudioMixer({ audio, ambienceLevel, microphoneState, monitorEnabled, monitorStatus, programAudioState, programLevel, voiceLevel, onToggleMonitor, onToggleProgram, onUpdate }: Props) {
  const voiceLive = audio.voiceEnabled && microphoneState === "published";
  const programLive = audio.transport === "playing";
  const ambienceLive = programLive && audio.soundscapeEnabled;
  const masterLive = programLive && !audio.masterMuted;

  return <section className="stage-control-section stage-studio-mixer" data-master={audio.masterMuted ? "muted" : "live"} data-voice={audio.voiceEnabled ? "on" : "off"} data-soundscape={audio.soundscapeEnabled ? "on" : "off"}>
    <header><div><span className="eyebrow">STUDIO AUDIO</span><h2>Voice and program mixer</h2></div><span className={`stage-sync-state ${masterLive ? "audio-live" : ""}`}><i/>{masterLive ? "MIX LIVE" : "MIX SAFE"}</span></header>
    <div className="studio-mixer-grid">
      <div className={`studio-channel ${voiceLive ? "live" : ""}`}>
        <div className="studio-channel-head"><Mic2/><span><b>VOICE</b><small>48 kHz / processed</small></span><button aria-pressed={audio.voiceEnabled} aria-label={audio.voiceEnabled ? "Turn studio voice off" : "Turn studio voice on"} title={audio.voiceEnabled ? "Turn studio voice off" : "Turn studio voice on"} onClick={() => onUpdate({ voiceEnabled: !audio.voiceEnabled })}><Power/></button></div>
        <div className="studio-channel-body"><Fader label="VOICE" value={audio.voiceGain} max={120} onChange={(voiceGain) => onUpdate({ voiceGain })}/><Meter level={voiceLive ? voiceLevel : 0} label="Voice"/></div>
        <div className="studio-processing"><span>HPF</span><span>EQ</span><span>COMP</span><span>NS</span></div>
      </div>

      <div className={`studio-channel ${programLive ? "live" : ""}`}>
        <div className="studio-channel-head"><Music2/><span><b>PROGRAM</b><small>Decks and stingers</small></span><button aria-pressed={programLive} aria-label={programLive ? "Stop program audio" : "Start program audio"} title={programLive ? "Stop program audio" : "Start program audio"} onClick={() => void onToggleProgram()}><Power/></button></div>
        <div className="studio-channel-body"><Fader label="PROGRAM" value={audio.programGain} onChange={(programGain) => onUpdate({ programGain })}/><Meter level={programLive ? programLevel : 0} label="Program"/></div>
        <div className="studio-channel-status"><Radio/><span>{programAudioState === "published" ? "ROOM MIX" : programAudioState.toUpperCase()}</span></div>
      </div>

      <div className={`studio-channel ${ambienceLive ? "live" : ""}`}>
        <div className="studio-channel-head"><Waves/><span><b>ATMOS</b><small>Spatial soundscape</small></span><button aria-pressed={audio.soundscapeEnabled} aria-label={audio.soundscapeEnabled ? "Turn spatial atmosphere off" : "Turn spatial atmosphere on"} title={audio.soundscapeEnabled ? "Turn spatial atmosphere off" : "Turn spatial atmosphere on"} onClick={() => onUpdate({ soundscapeEnabled: !audio.soundscapeEnabled })}><Power/></button></div>
        <div className="studio-channel-body"><Fader label="ATMOS" value={audio.soundscapeGain} onChange={(soundscapeGain) => onUpdate({ soundscapeGain })}/><Meter level={ambienceLive ? ambienceLevel : 0} label="Atmosphere"/></div>
        <div className="studio-channel-status"><Waves/><span>{audio.soundscape.replaceAll("-", " ").toUpperCase()}</span></div>
      </div>

      <div className={`studio-channel master ${masterLive ? "live" : ""}`}>
        <div className="studio-channel-head">{audio.masterMuted ? <VolumeX/> : <Volume2/>}<span><b>MASTER</b><small>Limiter output</small></span><button aria-pressed={!audio.masterMuted} aria-label={audio.masterMuted ? "Unmute master output" : "Mute master output"} title={audio.masterMuted ? "Unmute master output" : "Mute master output"} onClick={() => onUpdate({ masterMuted: !audio.masterMuted })}>{audio.masterMuted ? <VolumeX/> : <Power/>}</button></div>
        <div className="studio-channel-body"><Fader label="MASTER" value={audio.master} onChange={(master) => onUpdate({ master })}/><Meter level={masterLive ? Math.max(programLevel, ambienceLevel) * audio.master / 100 : 0} label="Master"/></div>
        <button className={`studio-monitor ${monitorEnabled ? "active" : ""}`} onClick={() => void onToggleMonitor()}><Headphones/><span>{monitorEnabled ? "MONITOR ON" : "MONITOR OFF"}</span><small>{monitorStatus.toUpperCase()}</small></button>
      </div>
    </div>
  </section>;
}

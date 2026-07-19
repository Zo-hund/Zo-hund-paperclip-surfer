import { useCallback, useEffect, useRef, useState } from "react";
import type { StageAudioState, StageDeckTrack, StageSoundscape } from "./stage-production";

type MonitorStatus = "off" | "starting" | "ready" | "blocked" | "unsupported";

type DeckNodes = {
  tone: OscillatorNode;
  harmonic: OscillatorNode;
  filter: BiquadFilterNode;
  output: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
};

type SoundscapeEngine = {
  context: AudioContext;
  master: GainNode;
  deckA: DeckNodes;
  deckB: DeckNodes;
  bedTone: OscillatorNode;
  bedGain: GainNode;
  bedFilter: BiquadFilterNode;
  noise: AudioBufferSourceNode;
  noiseGain: GainNode;
  noiseFilter: BiquadFilterNode;
};

const TRACKS: Record<StageDeckTrack, { root: number; harmonic: number; cutoff: number }> = {
  "air-pulse": { root: 55, harmonic: 110, cutoff: 920 },
  "night-grid": { root: 65.41, harmonic: 130.81, cutoff: 720 },
  "spoken-bed": { root: 73.42, harmonic: 146.83, cutoff: 540 },
  "sponsor-sting": { root: 82.41, harmonic: 164.81, cutoff: 1350 },
};

const SOUNDSCAPES: Record<StageSoundscape, { bed: number; cutoff: number; noise: number }> = {
  "air-grid": { bed: 110, cutoff: 1250, noise: 0.055 },
  "deep-focus": { bed: 73.42, cutoff: 620, noise: 0.035 },
  "crowd-warmup": { bed: 98, cutoff: 1780, noise: 0.105 },
  "podcast-room": { bed: 82.41, cutoff: 430, noise: 0.022 },
};

function createDeck(context: AudioContext, destination: AudioNode, pan: number): DeckNodes {
  const output = context.createGain();
  output.gain.value = 0;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 2.4;
  const panner = context.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1.5;
  panner.maxDistance = 24;
  panner.rolloffFactor = 0.55;
  panner.positionX.value = pan * 9;
  panner.positionY.value = 1.6;
  panner.positionZ.value = -4.2;
  const tone = context.createOscillator();
  tone.type = "sawtooth";
  const harmonic = context.createOscillator();
  harmonic.type = "sine";
  const toneGain = context.createGain();
  toneGain.gain.value = 0.12;
  const harmonicGain = context.createGain();
  harmonicGain.gain.value = 0.18;
  const lfo = context.createOscillator();
  lfo.type = "triangle";
  const lfoDepth = context.createGain();
  lfoDepth.gain.value = 180;
  tone.connect(toneGain).connect(filter);
  harmonic.connect(harmonicGain).connect(filter);
  lfo.connect(lfoDepth).connect(filter.frequency);
  filter.connect(panner).connect(output).connect(destination);
  tone.start();
  harmonic.start();
  lfo.start();
  return { tone, harmonic, filter, output, lfo, lfoDepth };
}

function createNoise(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function createEngine() {
  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  const context = new AudioContextConstructor({ latencyHint: "interactive" });
  if ("positionX" in context.listener) {
    context.listener.positionX.value = 0;
    context.listener.positionY.value = 1.65;
    context.listener.positionZ.value = 4.5;
  }
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 14;
  compressor.ratio.value = 5;
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(compressor).connect(context.destination);
  const deckA = createDeck(context, master, -0.32);
  const deckB = createDeck(context, master, 0.32);
  const bedGain = context.createGain();
  bedGain.gain.value = 0;
  const bedFilter = context.createBiquadFilter();
  bedFilter.type = "lowpass";
  const bedTone = context.createOscillator();
  bedTone.type = "sine";
  bedTone.connect(bedFilter).connect(bedGain).connect(master);
  bedTone.start();
  const noise = createNoise(context);
  const noiseGain = context.createGain();
  noiseGain.gain.value = 0;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.Q.value = 0.7;
  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start();
  return { context, master, deckA, deckB, bedTone, bedGain, bedFilter, noise, noiseGain, noiseFilter } satisfies SoundscapeEngine;
}

function applyDeck(deck: DeckNodes, track: StageDeckTrack, bpm: number, now: number) {
  const preset = TRACKS[track];
  deck.tone.frequency.setTargetAtTime(preset.root, now, 0.08);
  deck.harmonic.frequency.setTargetAtTime(preset.harmonic, now, 0.08);
  deck.filter.frequency.setTargetAtTime(preset.cutoff, now, 0.12);
  deck.lfo.frequency.setTargetAtTime(Math.max(0.5, bpm / 60 / 2), now, 0.1);
}

function applyState(engine: SoundscapeEngine, state: StageAudioState) {
  const now = engine.context.currentTime;
  const active = state.transport === "playing";
  const crossfader = Math.max(0, Math.min(1, state.crossfader / 100));
  const deckA = Math.cos(crossfader * Math.PI / 2) * 0.72;
  const deckB = Math.sin(crossfader * Math.PI / 2) * 0.72;
  engine.master.gain.setTargetAtTime(active ? Math.max(0, Math.min(1, state.master / 100)) * 0.34 : 0, now, 0.08);
  engine.deckA.output.gain.setTargetAtTime(deckA, now, 0.06);
  engine.deckB.output.gain.setTargetAtTime(deckB, now, 0.06);
  applyDeck(engine.deckA, state.deckA, state.bpm, now);
  applyDeck(engine.deckB, state.deckB, state.bpm, now);
  const soundscape = SOUNDSCAPES[state.soundscape];
  engine.bedTone.frequency.setTargetAtTime(soundscape.bed, now, 0.18);
  engine.bedFilter.frequency.setTargetAtTime(soundscape.cutoff, now, 0.18);
  engine.bedGain.gain.setTargetAtTime(state.format === "podcast" ? 0.08 : 0.12, now, 0.12);
  engine.noiseFilter.frequency.setTargetAtTime(soundscape.cutoff * 1.35, now, 0.18);
  engine.noiseGain.gain.setTargetAtTime(soundscape.noise, now, 0.12);
}

export function useStageSoundscape(state: StageAudioState) {
  const engineRef = useRef<SoundscapeEngine | null>(null);
  const stateRef = useRef(state);
  const [status, setStatus] = useState<MonitorStatus>("off");
  stateRef.current = state;

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) applyState(engine, state);
  }, [state]);

  useEffect(() => () => {
    const engine = engineRef.current;
    engineRef.current = null;
    if (engine) void engine.context.close();
  }, []);

  const enable = useCallback(async () => {
    setStatus("starting");
    try {
      const engine = engineRef.current || createEngine();
      if (!engine) {
        setStatus("unsupported");
        return false;
      }
      engineRef.current = engine;
      await engine.context.resume();
      applyState(engine, stateRef.current);
      setStatus("ready");
      return true;
    } catch {
      setStatus("blocked");
      return false;
    }
  }, []);

  const disable = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) await engine.context.suspend();
    setStatus("off");
  }, []);

  return { status, enable, disable, enabled: status === "ready" };
}

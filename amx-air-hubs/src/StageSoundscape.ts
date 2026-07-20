import { useCallback, useEffect, useRef, useState } from "react";
import {
  stageAudioAssetForTrack, type StageAudioState, type StageDeckPreset, type StageDeckTrack, type StageSoundDesign, type StageSoundscape,
} from "./stage-audio";

type MonitorStatus = "off" | "starting" | "ready" | "blocked" | "unsupported";

type DeckNodes = {
  tone: OscillatorNode;
  toneGain: GainNode;
  harmonic: OscillatorNode;
  harmonicGain: GainNode;
  filter: BiquadFilterNode;
  output: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  media: HTMLAudioElement;
  mediaGain: GainNode;
  loadedTrack: StageDeckTrack | null;
};

type SoundscapeEngine = {
  context: AudioContext;
  compressor: DynamicsCompressorNode;
  master: GainNode;
  programOutput: MediaStreamAudioDestinationNode;
  deckA: DeckNodes;
  deckB: DeckNodes;
  bedTone: OscillatorNode;
  bedGain: GainNode;
  bedFilter: BiquadFilterNode;
  noise: AudioBufferSourceNode;
  noiseGain: GainNode;
  noiseFilter: BiquadFilterNode;
  stinger: HTMLAudioElement;
  stingerGain: GainNode;
  lastStingerAt: number | null;
  lastScoreAt: number | null;
};

const TRACKS: Record<StageDeckPreset, { root: number; harmonic: number; cutoff: number }> = {
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
  const mediaGain = context.createGain();
  mediaGain.gain.value = 0;
  const media = document.createElement("audio");
  media.preload = "auto";
  media.loop = true;
  const mediaSource = context.createMediaElementSource(media);
  const lfo = context.createOscillator();
  lfo.type = "triangle";
  const lfoDepth = context.createGain();
  lfoDepth.gain.value = 180;
  tone.connect(toneGain).connect(filter);
  harmonic.connect(harmonicGain).connect(filter);
  mediaSource.connect(mediaGain).connect(filter);
  lfo.connect(lfoDepth).connect(filter.frequency);
  filter.connect(panner).connect(output).connect(destination);
  tone.start();
  harmonic.start();
  lfo.start();
  return { tone, toneGain, harmonic, harmonicGain, filter, output, lfo, lfoDepth, media, mediaGain, loadedTrack: null };
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
  const programOutput = context.createMediaStreamDestination();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(compressor);
  compressor.connect(context.destination);
  compressor.connect(programOutput);
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
  const stinger = document.createElement("audio");
  stinger.preload = "auto";
  const stingerGain = context.createGain();
  stingerGain.gain.value = 0.88;
  context.createMediaElementSource(stinger).connect(stingerGain).connect(compressor);
  return { context, compressor, master, programOutput, deckA, deckB, bedTone, bedGain, bedFilter, noise, noiseGain, noiseFilter, stinger, stingerGain, lastStingerAt: null, lastScoreAt: null } satisfies SoundscapeEngine;
}

function alignMedia(media: HTMLAudioElement, state: StageAudioState) {
  if (!state.startedAt || !Number.isFinite(media.duration) || media.duration <= 0) return;
  const target = Math.max(0, (Date.now() - state.startedAt) / 1000) % media.duration;
  if (Math.abs(media.currentTime - target) > 1.5) media.currentTime = target;
}

function applyDeck(deck: DeckNodes, track: StageDeckTrack, state: StageAudioState, now: number) {
  const asset = stageAudioAssetForTrack(track, state.library);
  if (asset) {
    deck.toneGain.gain.setTargetAtTime(0, now, 0.04);
    deck.harmonicGain.gain.setTargetAtTime(0, now, 0.04);
    deck.mediaGain.gain.setTargetAtTime(0.82, now, 0.06);
    deck.filter.frequency.setTargetAtTime(16_000, now, 0.08);
    deck.lfoDepth.gain.setTargetAtTime(0, now, 0.05);
    if (deck.loadedTrack !== track) {
      deck.loadedTrack = track;
      deck.media.src = asset.url;
      deck.media.load();
      deck.media.onloadedmetadata = () => alignMedia(deck.media, state);
    }
    alignMedia(deck.media, state);
    if (state.transport === "playing") void deck.media.play().catch(() => undefined);
    else deck.media.pause();
    return;
  }

  deck.media.pause();
  deck.mediaGain.gain.setTargetAtTime(0, now, 0.04);
  deck.toneGain.gain.setTargetAtTime(0.12, now, 0.04);
  deck.harmonicGain.gain.setTargetAtTime(0.18, now, 0.04);
  deck.lfoDepth.gain.setTargetAtTime(180, now, 0.05);
  const preset = TRACKS[track as StageDeckPreset] || TRACKS["air-pulse"];
  deck.tone.frequency.setTargetAtTime(preset.root, now, 0.08);
  deck.harmonic.frequency.setTargetAtTime(preset.harmonic, now, 0.08);
  deck.filter.frequency.setTargetAtTime(preset.cutoff, now, 0.12);
  deck.lfo.frequency.setTargetAtTime(Math.max(0.5, state.bpm / 60 / 2), now, 0.1);
}

function playPresetStinger(engine: SoundscapeEngine, preset: StageDeckPreset) {
  const shape = TRACKS[preset] || TRACKS["sponsor-sting"];
  const now = engine.context.currentTime;
  [shape.root * 2, shape.harmonic * 2].forEach((frequency, index) => {
    const oscillator = engine.context.createOscillator();
    const gain = engine.context.createGain();
    oscillator.type = index ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, now + 0.35);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(index ? 0.16 : 0.24, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    oscillator.connect(gain).connect(engine.compressor);
    oscillator.start(now + index * 0.05);
    oscillator.stop(now + 0.9);
  });
}

function applyStinger(engine: SoundscapeEngine, state: StageAudioState) {
  if (!state.stingerTriggeredAt || state.stingerTriggeredAt === engine.lastStingerAt || !state.stingerTrack) return;
  engine.lastStingerAt = state.stingerTriggeredAt;
  const elapsed = (Date.now() - state.stingerTriggeredAt) / 1000;
  if (elapsed > 4) return;
  const asset = stageAudioAssetForTrack(state.stingerTrack, state.library);
  if (!asset) {
    engine.stinger.pause();
    playPresetStinger(engine, state.stingerTrack as StageDeckPreset);
    return;
  }
  if (engine.stinger.src !== new URL(asset.url, location.href).href) engine.stinger.src = asset.url;
  engine.stinger.currentTime = Math.max(0, elapsed);
  void engine.stinger.play().catch(() => undefined);
}

function scoreVoice(engine: SoundscapeEngine, options: { at: number; duration: number; start: number; end: number; gain: number; type?: OscillatorType }) {
  const oscillator = engine.context.createOscillator();
  const gain = engine.context.createGain();
  oscillator.type = options.type || "triangle";
  oscillator.frequency.setValueAtTime(options.start, options.at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.end), options.at + options.duration);
  gain.gain.setValueAtTime(0.0001, options.at);
  gain.gain.exponentialRampToValueAtTime(options.gain, options.at + Math.min(0.04, options.duration * 0.18));
  gain.gain.exponentialRampToValueAtTime(0.0001, options.at + options.duration);
  oscillator.connect(gain).connect(engine.stingerGain);
  oscillator.start(options.at);
  oscillator.stop(options.at + options.duration + 0.02);
}

function playScoreSound(engine: SoundscapeEngine, design: StageSoundDesign, bpm: number) {
  const now = engine.context.currentTime + 0.015;
  if (design === "impact") {
    scoreVoice(engine, { at: now, duration: 0.92, start: 118, end: 38, gain: 0.38, type: "sine" });
    scoreVoice(engine, { at: now + 0.018, duration: 0.58, start: 244, end: 62, gain: 0.2, type: "triangle" });
    return;
  }
  if (design === "riser") {
    scoreVoice(engine, { at: now, duration: 1.35, start: 92, end: 740, gain: 0.2, type: "sawtooth" });
    scoreVoice(engine, { at: now + 0.12, duration: 1.2, start: 184, end: 1108, gain: 0.12, type: "sine" });
    return;
  }
  if (design === "pulse") {
    const interval = Math.min(0.5, Math.max(0.375, 60 / Math.max(60, Math.min(160, bpm))));
    [0, interval].forEach((offset, index) => scoreVoice(engine, { at: now + offset, duration: 0.28, start: index ? 164.81 : 110, end: index ? 123.47 : 82.41, gain: 0.22, type: "triangle" }));
    return;
  }
  if (design === "sparkle") {
    [523.25, 659.25, 783.99].forEach((frequency, index) => scoreVoice(engine, { at: now + index * 0.075, duration: 0.48, start: frequency, end: frequency * 1.18, gain: 0.1, type: "sine" }));
  }
}

function applyScoreSound(engine: SoundscapeEngine, state: StageAudioState) {
  const score = state.score;
  if (!score.armed || score.sound === "none" || !score.firedAt || score.firedAt === engine.lastScoreAt) return;
  engine.lastScoreAt = score.firedAt;
  if (Date.now() - score.firedAt > 4_000) return;
  playScoreSound(engine, score.sound, state.bpm);
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
  applyDeck(engine.deckA, state.deckA, state, now);
  applyDeck(engine.deckB, state.deckB, state, now);
  const soundscape = SOUNDSCAPES[state.soundscape];
  engine.bedTone.frequency.setTargetAtTime(soundscape.bed, now, 0.18);
  engine.bedFilter.frequency.setTargetAtTime(soundscape.cutoff, now, 0.18);
  engine.bedGain.gain.setTargetAtTime(state.format === "podcast" ? 0.08 : 0.12, now, 0.12);
  engine.noiseFilter.frequency.setTargetAtTime(soundscape.cutoff * 1.35, now, 0.18);
  engine.noiseGain.gain.setTargetAtTime(soundscape.noise, now, 0.12);
  engine.stingerGain.gain.setTargetAtTime(Math.max(0, Math.min(1, state.master / 100)) * 0.88, now, 0.06);
  applyStinger(engine, state);
  applyScoreSound(engine, state);
}

export function useStageSoundscape(state: StageAudioState) {
  const engineRef = useRef<SoundscapeEngine | null>(null);
  const stateRef = useRef(state);
  const [status, setStatus] = useState<MonitorStatus>("off");
  const [programStream, setProgramStream] = useState<MediaStream | null>(null);
  stateRef.current = state;

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) applyState(engine, state);
  }, [state]);

  useEffect(() => () => {
    const engine = engineRef.current;
    engineRef.current = null;
    if (engine) {
      engine.deckA.media.pause();
      engine.deckB.media.pause();
      engine.stinger.pause();
      void engine.context.close();
    }
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
      setProgramStream(engine.programOutput.stream);
      setStatus("ready");
      return true;
    } catch {
      setStatus("blocked");
      return false;
    }
  }, []);

  const disable = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) {
      engine.deckA.media.pause();
      engine.deckB.media.pause();
      engine.stinger.pause();
      await engine.context.suspend();
    }
    setStatus("off");
  }, []);

  return { status, enable, disable, enabled: status === "ready", programStream };
}

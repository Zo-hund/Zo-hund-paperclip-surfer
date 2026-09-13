import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export type TwinSource = "simulation" | "sensor";
export type TwinScenarioId = "baseline" | "peak-load" | "cooling-loss" | "predictive-maintenance";

export interface TwinTelemetry {
  timestamp: string;
  source: TwinSource;
  energyKw: number;
  temperatureC: number;
  vibrationMmS: number;
  throughput: number;
  coolingPercent: number;
  utilizationPercent: number;
}

export interface TwinForecast {
  riskPercent: number;
  healthPercent: number;
  failureWindowHours: number | null;
  state: "nominal" | "watch" | "critical";
  recommendation: string;
}

export interface TwinScenario {
  id: TwinScenarioId;
  label: string;
  detail: string;
}

export interface TwinScenarioResult {
  id: string;
  scenario: TwinScenarioId;
  createdAt: string;
  baseline: TwinForecast;
  projected: TwinForecast;
  projectedTelemetry: TwinTelemetry;
  recommendation: string;
  approved: boolean;
}

type TwinPacket = { type: "telemetry"; telemetry: TwinTelemetry } | { type: "scenario"; result: TwinScenarioResult };

export const twinScenarios: TwinScenario[] = [
  { id: "baseline", label: "Baseline", detail: "Hold the current operating envelope." },
  { id: "peak-load", label: "Peak load", detail: "Model a high-throughput demand spike." },
  { id: "cooling-loss", label: "Cooling loss", detail: "Stress-test a degraded cooling loop." },
  { id: "predictive-maintenance", label: "Maintenance", detail: "Model a planned service intervention." },
];

function round(value: number, precision = 1) {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function forecastTwin(telemetry: TwinTelemetry): TwinForecast {
  const temperatureRisk = clamp((telemetry.temperatureC - 38) * 2.35, 0, 55);
  const vibrationRisk = clamp((telemetry.vibrationMmS - 1.5) * 12, 0, 45);
  const loadRisk = clamp((telemetry.utilizationPercent - 72) * 0.72, 0, 24);
  const coolingRelief = clamp((telemetry.coolingPercent - 55) * 0.18, 0, 8);
  const riskPercent = Math.round(clamp(8 + temperatureRisk + vibrationRisk + loadRisk - coolingRelief, 2, 98));
  const state = riskPercent >= 72 ? "critical" : riskPercent >= 42 ? "watch" : "nominal";
  const failureWindowHours = state === "nominal" ? null : Math.max(2, Math.round((100 - riskPercent) * (state === "critical" ? 0.35 : 1.4)));
  const recommendation = state === "critical"
    ? "Keep physical actuation locked. Reduce load and inspect cooling and vibration before approval."
    : state === "watch"
      ? "Stage a maintenance window and compare cooling and throughput scenarios."
      : "Continue observation and retain the current control envelope.";
  return { riskPercent, healthPercent: 100 - riskPercent, failureWindowHours, state, recommendation };
}

function simulateTelemetry(tick: number, scenario: TwinScenarioId): TwinTelemetry {
  const wave = Math.sin(tick * 0.43);
  const pulse = Math.abs(Math.sin(tick * 0.19));
  const offsets = scenario === "peak-load"
    ? { energy: 42, temperature: 12, vibration: 1.3, throughput: 31, cooling: 12, utilization: 23 }
    : scenario === "cooling-loss"
      ? { energy: 10, temperature: 24, vibration: 1.8, throughput: -18, cooling: -48, utilization: 5 }
      : scenario === "predictive-maintenance"
        ? { energy: -18, temperature: -8, vibration: -1.1, throughput: -12, cooling: 8, utilization: -16 }
        : { energy: 0, temperature: 0, vibration: 0, throughput: 0, cooling: 0, utilization: 0 };
  return {
    timestamp: new Date().toISOString(),
    source: "simulation",
    energyKw: round(118 + wave * 6 + offsets.energy),
    temperatureC: round(39 + pulse * 4 + offsets.temperature),
    vibrationMmS: round(Math.max(0.3, 1.7 + pulse * 0.8 + offsets.vibration), 2),
    throughput: Math.round(clamp(74 + wave * 4 + offsets.throughput, 0, 120)),
    coolingPercent: Math.round(clamp(68 + wave * 5 + offsets.cooling, 0, 100)),
    utilizationPercent: Math.round(clamp(66 + pulse * 8 + offsets.utilization, 0, 100)),
  };
}

export function runTwinScenario(current: TwinTelemetry, scenario: TwinScenarioId): TwinScenarioResult {
  const projectedTelemetry = simulateTelemetry(Date.now() / 1_000, scenario);
  projectedTelemetry.source = current.source;
  const baseline = forecastTwin(current);
  const projected = forecastTwin(projectedTelemetry);
  return {
    id: crypto.randomUUID(),
    scenario,
    createdAt: new Date().toISOString(),
    baseline,
    projected,
    projectedTelemetry,
    recommendation: projected.recommendation,
    approved: false,
  };
}

function localHost() {
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

function persistTwinEvent(roomCode: string, eventType: "scenario" | "approval", payload: TwinScenarioResult) {
  if (localHost()) return;
  void fetch("/api/twins/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      twinId: "facility-cell-01",
      roomCode,
      eventType,
      payload,
      createdAt: new Date().toISOString(),
    }),
  }).catch(() => undefined);
}

export function useDigitalTwin(roomCode: string) {
  const room = roomCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 64) || "LOCAL";
  const [scenario, setScenario] = useState<TwinScenarioId>("baseline");
  const [telemetry, setTelemetry] = useState<TwinTelemetry>(() => simulateTelemetry(0, "baseline"));
  const [history, setHistory] = useState<TwinTelemetry[]>([]);
  const [result, setResult] = useState<TwinScenarioResult | null>(null);
  const [transport, setTransport] = useState<"connecting" | "websocket" | "local mesh">("connecting");
  const tickRef = useRef(0);
  const localRef = useRef<BroadcastChannel | null>(null);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const receive = useCallback((packet: TwinPacket) => {
    if (packet.type === "telemetry") {
      setTelemetry(packet.telemetry);
      setHistory((current) => [...current.slice(-39), packet.telemetry]);
    } else setResult(packet.result);
  }, []);

  const broadcast = useCallback((packet: TwinPacket) => {
    if (realtimeRef.current) void realtimeRef.current.send({ type: "broadcast", event: "twin-sync", payload: packet });
    else localRef.current?.postMessage(packet);
  }, []);

  useEffect(() => {
    const config = window.__AMX_CONFIG__;
    if (localHost() || !config?.supabaseUrl || !config.supabasePublishableKey) {
      const channel = new BroadcastChannel(`amx-twin-${room}`);
      channel.onmessage = (event) => receive(event.data as TwinPacket);
      localRef.current = channel;
      setTransport("local mesh");
    } else {
      const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const channel = supabase.channel(`amx-twin-${room}`, { config: { broadcast: { self: false } } });
      supabaseRef.current = supabase;
      realtimeRef.current = channel;
      channel.on("broadcast", { event: "twin-sync" }, ({ payload }) => receive(payload as TwinPacket)).subscribe((status) => {
        if (status === "SUBSCRIBED") setTransport("websocket");
      });
    }
    return () => {
      localRef.current?.close();
      if (realtimeRef.current && supabaseRef.current) void supabaseRef.current.removeChannel(realtimeRef.current);
      localRef.current = null;
      realtimeRef.current = null;
      supabaseRef.current = null;
    };
  }, [receive, room]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = simulateTelemetry(tickRef.current++, scenario);
      receive({ type: "telemetry", telemetry: next });
      broadcast({ type: "telemetry", telemetry: next });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [broadcast, receive, scenario]);

  const runScenario = useCallback((nextScenario: TwinScenarioId) => {
    setScenario(nextScenario);
    const next = runTwinScenario(telemetry, nextScenario);
    setResult(next);
    broadcast({ type: "scenario", result: next });
    persistTwinEvent(room, "scenario", next);
    return next;
  }, [broadcast, room, telemetry]);

  const approveResult = useCallback(() => {
    setResult((current) => {
      if (!current) return current;
      const approved = { ...current, approved: true };
      broadcast({ type: "scenario", result: approved });
      persistTwinEvent(room, "approval", approved);
      return approved;
    });
  }, [broadcast, room]);

  return { telemetry, history, forecast: useMemo(() => forecastTwin(telemetry), [telemetry]), scenario, result, transport, runScenario, approveResult };
}

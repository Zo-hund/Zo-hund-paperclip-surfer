/**
 * VoiceCommandOrb
 *
 * A premium floating voice command button that appears on every page of the
 * AMX LABS Paperclip platform. When active, it connects to the existing
 * Gemini Live WebSocket (no LiveKit required for global mode) and routes
 * voice commands to platform operations and navigation.
 *
 * For LiveKit room-based mode (meetings), VoiceMeetingRoom handles audio.
 * This orb is for GLOBAL voice control outside meetings.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Mic, MicOff, X, Loader2, Sparkles, Volume2 } from "lucide-react";
import { useToast } from "../context/ToastContext";

type OrbStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

interface Props {
  /** Company prefix e.g. "AMXA" — used to build navigation paths */
  companyPrefix?: string;
}

const STATUS_LABEL: Record<OrbStatus, string> = {
  idle: "Voice Commands",
  connecting: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Error",
};

const STATUS_COLOR: Record<OrbStatus, string> = {
  idle: "rgba(148,163,184,0.15)",
  connecting: "rgba(251,191,36,0.25)",
  listening: "rgba(52,211,153,0.25)",
  thinking: "rgba(251,191,36,0.25)",
  speaking: "rgba(96,165,250,0.30)",
  error: "rgba(239,68,68,0.25)",
};

const STATUS_GLOW: Record<OrbStatus, string> = {
  idle: "none",
  connecting: "0 0 25px rgba(251,191,36,0.4)",
  listening: "0 0 30px rgba(52,211,153,0.6), 0 0 60px rgba(52,211,153,0.3)",
  thinking: "0 0 25px rgba(251,191,36,0.5)",
  speaking: "0 0 30px rgba(96,165,250,0.6), 0 0 60px rgba(96,165,250,0.3)",
  error: "0 0 20px rgba(239,68,68,0.4)",
};

// Waveform bars for speaking animation
function WaveformBars({ status }: { status: OrbStatus }) {
  const active = status === "listening" || status === "speaking";
  const color =
    status === "speaking" ? "#60a5fa" :
    status === "listening" ? "#34d399" : "#94a3b8";

  const heights = [0.4, 0.7, 1.0, 0.6, 0.85, 0.5, 0.9, 0.65, 0.45, 0.8];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "2px", height: "20px" }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: "2px",
            height: active ? `${h * 100}%` : "20%",
            background: color,
            borderRadius: "2px",
            transition: "height 0.15s ease",
            animation: active
              ? `pulse ${0.3 + i * 0.06}s ease-in-out infinite alternate`
              : "none",
            boxShadow: active ? `0 0 4px ${color}` : "none",
          }}
        />
      ))}
    </div>
  );
}

export function VoiceCommandOrb({ companyPrefix }: Props) {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const params = useParams();

  const [status, setStatus] = useState<OrbStatus>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const location = useLocation();
  const prevPathRef = useRef<string>("");
  const [transcript, setTranscript] = useState<Array<{ role: "user" | "model"; text: string }>>([]);

  // The orb uses the Gemini Live WebSocket relay directly (same as VoiceMeetingRoom)
  // but without a meeting ID — uses a special "global-orb" endpoint
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const playingRef = useRef(false);

  // Derive the company prefix from URL params if not passed
  const effectivePrefix = companyPrefix ?? params.companyPrefix ?? "";

  const resolvePath = useCallback(
    (path: string) => {
      if (!effectivePrefix) return path;
      if (path.startsWith(`/${effectivePrefix}`)) return path;
      const clean = path.startsWith("/") ? path : `/${path}`;
      return `/${effectivePrefix}${clean}`;
    },
    [effectivePrefix],
  );

  // Play base64-encoded PCM audio from Gemini
  const playAudioChunk = useCallback(async (base64: string) => {
    try {
      const binary = atob(base64);
      const buf = new ArrayBuffer(binary.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
      audioQueueRef.current.push(buf);

      if (playingRef.current) return;
      playingRef.current = true;

      const ctx = audioCtxRef.current ?? new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = ctx;

      while (audioQueueRef.current.length > 0) {
        const chunk = audioQueueRef.current.shift()!;
        const int16 = new Int16Array(chunk);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

        const audioBuf = ctx.createBuffer(1, float32.length, 24000);
        audioBuf.copyToChannel(float32, 0);
        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        src.connect(ctx.destination);
        src.start();
        await new Promise<void>((resolve) => { src.onended = () => resolve(); });
      }
      playingRef.current = false;
    } catch { /* ignore audio errors */ }
  }, []);

  // Handle incoming WebSocket messages from the Gemini relay
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;

        if (msg.type === "status") {
          setStatus((msg.status as OrbStatus) ?? "idle");
          return;
        }

        if ((msg.type === "audio" || msg.type === "audio_response") && typeof msg.data === "string") {
          setStatus("speaking");
          void playAudioChunk(msg.data);
          return;
        }

        if (msg.type === "transcript") {
          const role = msg.role as "user" | "model";
          const text = String(msg.text ?? "");
          setTranscript((prev) => [...prev.slice(-19), { role, text }]);
          if (role === "model" && text.trim()) setLastCommand(text);
          return;
        }

        if (msg.type === "tool_call" && typeof msg.name === "string") {
          const args = (msg.args ?? {}) as Record<string, unknown>;

          if (msg.name === "navigate_to" && typeof args.path === "string") {
            const resolved = resolvePath(args.path);
            navigate(resolved);
            pushToast({ title: "Navigating", body: resolved });
          }
          if (msg.name === "navigate_to_agent" && typeof args.agentId === "string") {
            navigate(resolvePath(`/agents/${args.agentId}`));
          }
          if (msg.name === "navigate_to_issue" && typeof args.issueId === "string") {
            navigate(resolvePath(`/issues/${args.issueId}`));
          }
          if (msg.name === "open_modal") {
            // dispatch to global command bus
            window.dispatchEvent(new CustomEvent("amx:open_modal", { detail: args }));
          }
          return;
        }

        if (msg.type === "error") {
          setStatus("error");
          pushToast({ title: "Voice Agent Error", body: String(msg.message ?? "Unknown error"), tone: "error" });
        }
      } catch { /* ignore parse errors */ }
    },
    [navigate, resolvePath, pushToast, playAudioChunk],
  );

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");

    try {
      // Use a virtual meeting ID for the global orb
      const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/meetings/global-orb/gemini-live?modality=audio`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setStatus("connected" as OrbStatus);
      ws.onmessage = handleMessage;
      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("idle");
        cleanupAudio();
      };

      // Start mic capture
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMuted || ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
        }
        const b64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
        ws.send(JSON.stringify({ type: "audio_chunk", data: b64 }));
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      setStatus("listening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus("error");
      pushToast({ title: "Mic Error", body: msg, tone: "error" });
    }
  }, [handleMessage, isMuted, pushToast]);

  const cleanupAudio = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    cleanupAudio();
    setStatus("idle");
    setTranscript([]);
  }, [cleanupAudio]);

  const toggleConnection = useCallback(() => {
    if (status === "idle" || status === "error" || status === "disconnected" as OrbStatus) {
      void connect();
    } else {
      disconnect();
    }
  }, [status, connect, disconnect]);

  useEffect(() => {
    return () => { disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Announce page changes to the relay when the orb is active
  useEffect(() => {
    const path = location.pathname;
    if (path === prevPathRef.current) return;
    prevPathRef.current = path;
    // Only announce if we have an open WS connection
    if (
      wsRef.current?.readyState === WebSocket.OPEN &&
      status !== "idle" &&
      status !== "error"
    ) {
      wsRef.current.send(JSON.stringify({ type: "page_changed", path }));
    }
  }, [location.pathname, status]);

  const isActive = status !== "idle" && status !== "error";
  const orbColor = STATUS_COLOR[status];
  const orbGlow = STATUS_GLOW[status];

  return (
    <>
      {/* Floating Orb Button */}
      <div
        id="amx-voice-command-orb"
        style={{
          position: "fixed",
          bottom: "28px",
          right: "28px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "10px",
          pointerEvents: "auto",
        }}
      >
        {/* Expanded panel */}
        {isOpen && (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(8,8,20,0.98) 0%, rgba(12,12,28,0.98) 100%)",
              border: "1px solid rgba(148,163,184,0.15)",
              borderRadius: "20px",
              padding: "16px",
              width: "300px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
              backdropFilter: "blur(20px)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={14} style={{ color: "#94a3b8" }} />
                <span style={{
                  fontSize: "10px",
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.25em",
                  color: "#94a3b8",
                }}>
                  AMX Voice Agent
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.3)", padding: "2px" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Status */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              borderRadius: "10px",
              background: orbColor,
              border: `1px solid ${orbColor.replace("0.2", "0.3")}`,
            }}>
              <div style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: status === "listening" ? "#34d399" : status === "speaking" ? "#60a5fa" : status === "thinking" ? "#fbbf24" : status === "error" ? "#f87171" : "#475569",
                boxShadow: isActive ? `0 0 8px currentColor` : "none",
                animation: (status === "listening" || status === "thinking") ? "pulse 1s ease-in-out infinite" : "none",
              }} />
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.8)" }}>
                {STATUS_LABEL[status]}
              </span>
              {isActive && (
                <div style={{ marginLeft: "auto" }}>
                  <WaveformBars status={status} />
                </div>
              )}
            </div>

            {/* Transcript */}
            {transcript.length > 0 && (
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                maxHeight: "160px",
                overflowY: "auto",
                scrollbarWidth: "none",
              }}>
                {transcript.slice(-6).map((t, i) => (
                  <div key={i} style={{
                    padding: "6px 10px",
                    borderRadius: "10px",
                    fontSize: "12px",
                    lineHeight: "1.4",
                    background: t.role === "model"
                      ? "rgba(96,165,250,0.08)"
                      : "rgba(255,255,255,0.05)",
                    border: `1px solid ${t.role === "model" ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.08)"}`,
                    color: "rgba(255,255,255,0.85)",
                    textAlign: t.role === "user" ? "right" : "left",
                  }}>
                    {t.text}
                  </div>
                ))}
              </div>
            )}

            {/* Last command display */}
            {lastCommand && transcript.length === 0 && (
              <div style={{
                padding: "8px 12px",
                borderRadius: "10px",
                background: "rgba(96,165,250,0.06)",
                border: "1px solid rgba(96,165,250,0.15)",
                fontSize: "12px",
                color: "rgba(255,255,255,0.7)",
                lineHeight: "1.4",
              }}>
                <span style={{ fontSize: "9px", color: "#60a5fa", fontWeight: 700, textTransform: "uppercase", display: "block", marginBottom: "3px" }}>Last response</span>
                {lastCommand}
              </div>
            )}

            {/* Controls */}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                id="amx-orb-toggle-btn"
                onClick={toggleConnection}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  transition: "all 0.2s",
                  background: isActive
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(52,211,153,0.15)",
                  color: isActive ? "#f87171" : "#34d399",
                  border: `1px solid ${isActive ? "rgba(239,68,68,0.3)" : "rgba(52,211,153,0.3)"}`,
                }}
              >
                {status === "connecting" ? (
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite", display: "inline" }} />
                ) : isActive ? (
                  "End Session"
                ) : (
                  "Activate"
                )}
              </button>

              {isActive && (
                <button
                  id="amx-orb-mute-btn"
                  onClick={() => setIsMuted((m) => !m)}
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    cursor: "pointer",
                    background: isMuted ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)",
                    color: isMuted ? "#f87171" : "rgba(255,255,255,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                  }}
                >
                  {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
              )}
            </div>

            {/* Hint */}
            {!isActive && (
              <p style={{
                fontSize: "10px",
                color: "rgba(255,255,255,0.25)",
                textAlign: "center",
                margin: 0,
                lineHeight: "1.5",
              }}>
                Say <em>"Go to agents"</em>, <em>"Show open issues"</em>,<br />
                <em>"Create an issue"</em>, <em>"Wake up the CEO"</em>
              </p>
            )}
          </div>
        )}

        {/* The Orb button itself */}
        <button
          id="amx-voice-orb-main"
          onClick={() => setIsOpen((o) => !o)}
          aria-label={isActive ? `Voice agent: ${STATUS_LABEL[status]}` : "Activate voice commands"}
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.12), ${orbColor})`,
            backdropFilter: "blur(20px)",
            boxShadow: [
              "0 8px 32px rgba(0,0,0,0.5)",
              "0 2px 8px rgba(0,0,0,0.3)",
              "inset 0 1px 0 rgba(255,255,255,0.15)",
              orbGlow,
            ].filter(Boolean).join(", "),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: isOpen ? "scale(1.1)" : "scale(1)",
            outline: "none",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.12)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = isOpen ? "scale(1.1)" : "scale(1)";
          }}
        >
          {/* Outer pulse ring when listening */}
          {status === "listening" && (
            <span style={{
              position: "absolute",
              inset: "-4px",
              borderRadius: "50%",
              border: "2px solid rgba(52,211,153,0.5)",
              animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
              pointerEvents: "none",
            }} />
          )}
          {/* Outer pulse ring when speaking */}
          {status === "speaking" && (
            <span style={{
              position: "absolute",
              inset: "-4px",
              borderRadius: "50%",
              border: "2px solid rgba(96,165,250,0.5)",
              animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite",
              pointerEvents: "none",
            }} />
          )}

          {/* Icon */}
          {status === "connecting" ? (
            <Loader2
              size={22}
              style={{ color: "#fbbf24", animation: "spin 1s linear infinite" }}
            />
          ) : status === "speaking" ? (
            <Volume2 size={22} style={{ color: "#60a5fa" }} />
          ) : isActive ? (
            <Mic size={22} style={{ color: isMuted ? "#f87171" : "#34d399" }} />
          ) : (
            <Sparkles size={20} style={{ color: "#94a3b8" }} />
          )}
        </button>
      </div>

      {/* Ping animation keyframes injected as a style tag */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        #amx-voice-orb-main:focus-visible {
          outline: 2px solid rgba(148,163,184,0.5);
          outline-offset: 3px;
        }
      `}</style>
    </>
  );
}

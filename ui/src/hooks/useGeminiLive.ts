/**
 * useGeminiLive
 *
 * Client-side hook that connects to the server-side Gemini Live relay
 * at /api/meetings/:meetingId/gemini-live via WebSocket.
 *
 * Handles:
 *  - PCM16 mic capture via AudioWorklet (16kHz mono)
 *  - PCM16 audio playback via AudioContext
 *  - Video frame forwarding
 *  - Tool call dispatch callback
 *  - Reconnect with backoff (using ref flag to avoid stale-closure bug)
 *  - 30s keepalive ping to survive Cloudflare tunnel idle timeout
 */

import { useState, useRef, useCallback, useEffect } from "react";

export type GeminiStatus = "idle" | "connecting" | "connected" | "listening" | "thinking" | "speaking" | "error" | "unavailable";

export interface GeminiTranscriptEntry {
  role: "user" | "model";
  text: string;
}

export type ToolCallHandler = (name: string, callId: string, args: Record<string, unknown>) => Promise<unknown>;

export interface GeminiLiveState {
  status: GeminiStatus;
  transcript: GeminiTranscriptEntry[];
  isSpeaking: boolean;
  connect(): void;
  disconnect(): void;
  sendAudioChunk(pcm16Base64: string): void;
  sendVideoFrame(jpegBase64: string): void;
  sendText(text: string): void;
  setToolCallHandler(handler: ToolCallHandler): void;
  respondToTool(callId: string, name: string, result: unknown): void;
}

// AudioWorklet processor source (inlined as blob URL)
const WORKLET_SRC = `
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 0;
    this._chunkSamples = 1600; // 100ms at 16kHz
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    // Downsample from sampleRate to 16000 if needed
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      this._buffer.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }
    while (this._buffer.length >= this._chunkSamples) {
      const chunk = this._buffer.splice(0, this._chunkSamples);
      const int16 = new Int16Array(chunk);
      this.port.postMessage({ pcm16: int16.buffer }, [int16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm16-processor', PCM16Processor);
`;

function int16ToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToFloat32(base64: string, ctx: AudioContext): AudioBuffer | null {
  try {
    const binary = atob(base64);
    const len = binary.length % 2 === 0 ? binary.length : binary.length - 1;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    // Buffer MUST be created by the same AudioContext that will play it
    const buffer = ctx.createBuffer(1, int16.length, ctx.sampleRate);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < int16.length; i++) {
      channelData[i] = int16[i] / 0x8000;
    }
    return buffer;
  } catch (err) {
    console.error("[useGeminiLive] Error decoding audio chunk:", err);
    return null;
  }
}

export interface UseGeminiLiveOptions {
  /**
   * Response modality: "audio" (default) streams PCM audio + transcripts;
   * "text" returns only text replies — useful when mic access is unavailable
   * (headless browsers, denied permission, text-only cockpits).
   */
  modality?: "audio" | "text";
}

export function useGeminiLive(meetingId: string, options: UseGeminiLiveOptions = {}): GeminiLiveState {
  const { modality = "audio" } = options;
  const [status, setStatus] = useState<GeminiStatus>("idle");
  const [transcript, setTranscript] = useState<GeminiTranscriptEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  // Use a ref (not state) for reconnect intent — avoids stale-closure bug in onclose
  const shouldReconnectRef = useRef(false);
  const toolCallHandlerRef = useRef<ToolCallHandler | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<number>(0); // next playback time

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const startMicCapture = useCallback(async () => {
    if (!meetingId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      micStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;

      // Load worklet
      const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      const source = ctx.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(ctx, "pcm16-processor");
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (e: MessageEvent<{ pcm16: ArrayBuffer }>) => {
        const b64 = int16ToBase64(e.data.pcm16);
        send({ type: "audio_chunk", data: b64 });
      };

      source.connect(workletNode);
      workletNode.connect(ctx.destination);
    } catch (err) {
      console.error("[useGeminiLive] mic capture failed", err);
    }
  }, [meetingId, send]);

  const stopMicCapture = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

  const stopKeepalive = useCallback(() => {
    if (keepaliveTimerRef.current) {
      clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
  }, []);

  const playAudioResponse = useCallback((base64Pcm: string) => {
    try {
      if (!playbackCtxRef.current || playbackCtxRef.current.state === "closed") {
        playbackCtxRef.current = new AudioContext({ sampleRate: 24000 }); // Gemini outputs 24kHz
        playbackQueueRef.current = 0;
      }
      const ctx = playbackCtxRef.current;

      // Resume context if suspended (browser autoplay policy requires user gesture first)
      const play = () => {
        const audioBuffer = base64ToFloat32(base64Pcm, ctx);
        if (!audioBuffer) return;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        const startTime = Math.max(ctx.currentTime, playbackQueueRef.current);
        source.start(startTime);
        playbackQueueRef.current = startTime + audioBuffer.duration;
      };

      if (ctx.state === "suspended") {
        ctx.resume().then(play).catch((err) => console.error("[useGeminiLive] ctx resume failed", err));
      } else {
        play();
      }
    } catch (err) {
      console.error("[useGeminiLive] audio playback failed", err);
    }
  }, []);

  const doConnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const qs = modality === "text" ? "?modality=text" : "";
    const url = `${proto}//${window.location.host}/api/meetings/${meetingId}/gemini-live${qs}`;
    console.log("[useGeminiLive] Initiating WS connection to:", url);
    setStatus("connecting");

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[useGeminiLive] WS opened.", modality === "text" ? "Text mode (mic disabled)." : "Starting mic capture...");
        retryCountRef.current = 0;
        setStatus("connecting"); // wait for server's "connected" message
        if (modality !== "text") {
          void startMicCapture();
        }

        // Keepalive ping every 30s — prevents Cloudflare tunnel (and other proxies)
        // from closing idle WebSocket connections (~100s idle timeout).
        stopKeepalive();
        keepaliveTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30_000);
      };

      ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as {
            type: string;
            status?: string;
            text?: string;
            role?: string;
            data?: string;
            callId?: string;
            name?: string;
            args?: Record<string, unknown>;
            message?: string;
          };

          if (msg.type !== "audio_response") {
            console.log("[useGeminiLive] Received message:", msg.type, msg.status || msg.text || msg.message || "");
          }

          switch (msg.type) {
            case "status":
              setStatus(msg.status as GeminiStatus);
              setIsSpeaking(msg.status === "speaking");
              break;

            case "transcript":
              setTranscript((prev) => [...prev, { role: (msg.role ?? "model") as "user" | "model", text: msg.text ?? "" }]);
              break;

            case "audio_response":
              if (msg.data) playAudioResponse(msg.data);
              break;

            case "tool_call":
              if (toolCallHandlerRef.current && msg.name && msg.callId) {
                const result = await toolCallHandlerRef.current(msg.name, msg.callId, msg.args ?? {});
                send({ type: "tool_result", callId: msg.callId, result });
              }
              break;

            case "error":
              setStatus("error");
              console.error("[useGeminiLive] server error:", msg.message);
              break;

            case "pong":
              // keepalive acknowledged — no-op
              break;
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = (err) => {
        console.error("[useGeminiLive] WS error:", err);
        setStatus("error");
      };

      ws.onclose = (ev) => {
        console.log("[useGeminiLive] WS closed:", ev.code, ev.reason);
        stopMicCapture();
        stopKeepalive();
        // Use shouldReconnectRef (not stale `status` closure) to decide whether to retry
        if (shouldReconnectRef.current && retryCountRef.current < 5) {
          retryCountRef.current++;
          const delay = Math.min(2000 * retryCountRef.current, 10000);
          console.log(`[useGeminiLive] Reconnecting in ${delay}ms (attempt ${retryCountRef.current})`);
          reconnectTimerRef.current = setTimeout(() => doConnect(), delay);
        } else {
          shouldReconnectRef.current = false;
          setStatus("idle");
        }
      };
    } catch (err) {
      console.error("[useGeminiLive] Failed to construct WebSocket:", err);
      setStatus("error");
    }
  }, [meetingId, modality, send, startMicCapture, stopMicCapture, stopKeepalive, playAudioResponse]);

  const connect = useCallback(() => {
    // Ensure playback context is unlocked during the user gesture.
    if (!playbackCtxRef.current || playbackCtxRef.current.state === "closed") {
      try {
        playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
        playbackQueueRef.current = 0;
      } catch (err) {
        console.error("[useGeminiLive] Failed to create AudioContext:", err);
      }
    } else if (playbackCtxRef.current.state === "suspended") {
      playbackCtxRef.current.resume().catch((err) => console.error("[useGeminiLive] Failed to resume AudioContext:", err));
    }

    shouldReconnectRef.current = true;
    retryCountRef.current = 0;
    doConnect();
  }, [doConnect]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    retryCountRef.current = 99; // belt-and-suspenders: stop reconnect loop
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    stopKeepalive();
    stopMicCapture();
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    setStatus("idle");
    setIsSpeaking(false);
  }, [stopMicCapture, stopKeepalive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendAudioChunk = useCallback((pcm16Base64: string) => {
    send({ type: "audio_chunk", data: pcm16Base64 });
  }, [send]);

  const sendVideoFrame = useCallback((jpegBase64: string) => {
    send({ type: "video_frame", data: jpegBase64 });
  }, [send]);

  const sendText = useCallback((text: string) => {
    send({ type: "text", text });
  }, [send]);

  const setToolCallHandler = useCallback((handler: ToolCallHandler) => {
    toolCallHandlerRef.current = handler;
  }, []);

  const respondToTool = useCallback((callId: string, name: string, result: unknown) => {
    send({ type: "tool_result", callId, name, result });
  }, [send]);

  return {
    status,
    transcript,
    isSpeaking,
    connect,
    disconnect,
    sendAudioChunk,
    sendVideoFrame,
    sendText,
    setToolCallHandler,
    respondToTool,
  };
}

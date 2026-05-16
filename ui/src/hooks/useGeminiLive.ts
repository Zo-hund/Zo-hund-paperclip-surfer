/**
 * useGeminiLive
 *
 * Client-side hook that connects to the server-side Gemini chat+TTS relay
 * at /api/meetings/:meetingId/gemini-live via WebSocket.
 *
 * Architecture (fallback from unavailable Live bidi API):
 *  - Browser Web Speech API (SpeechRecognition) handles STT locally — no key needed
 *  - Transcripts are sent as text to server via WebSocket
 *  - Server responds with gemini-2.5-flash text + gemini-2.5-flash-preview-tts audio
 *  - Audio is played back via AudioContext at 24kHz
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
  audioLevel: number;
  connect(): void;
  disconnect(): void;
  sendAudioChunk(pcm16Base64: string): void;
  sendVideoFrame(jpegBase64: string): void;
  sendText(text: string): void;
  setToolCallHandler(handler: ToolCallHandler): void;
  respondToTool(callId: string, name: string, result: unknown): void;
}

function base64ToFloat32(base64: string, ctx: AudioContext): AudioBuffer | null {
  try {
    const binary = atob(base64);
    const len = binary.length % 2 === 0 ? binary.length : binary.length - 1;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
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
  modality?: "audio" | "text";
}

export function useGeminiLive(meetingId: string, options: UseGeminiLiveOptions = {}): GeminiLiveState {
  const { modality = "audio" } = options;
  const [status, setStatus] = useState<GeminiStatus>("idle");
  const [transcript, setTranscript] = useState<GeminiTranscriptEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const toolCallHandlerRef = useRef<ToolCallHandler | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Web Speech API refs
  const recognitionRef = useRef<any | null>(null);
  const recognitionActiveRef = useRef(false);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const encodePcm16Base64 = useCallback((input: Float32Array) => {
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i] ?? 0));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const bytes = new Uint8Array(pcm.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
    return btoa(binary);
  }, []);

  const stopPcmStreaming = useCallback(() => {
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current.onaudioprocess = null;
      micProcessorRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startPcmStreaming = useCallback(async () => {
    if (micStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 16000 });
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;

      // ScriptProcessor is deprecated but still broadly supported in Chromium/Electron.
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      micProcessorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0);
        if (!samples || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        // Lightweight RMS meter for UI state.
        let sumSquares = 0;
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i] ?? 0;
          sumSquares += s * s;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        setAudioLevel(Math.min(1, rms * 6));

        const pcm16Base64 = encodePcm16Base64(samples);
        send({ type: "audio_chunk", data: pcm16Base64 });
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      console.log("[useGeminiLive] PCM streaming fallback started");
    } catch (err) {
      console.error("[useGeminiLive] Failed to start PCM fallback:", err);
      setStatus("error");
    }
  }, [encodePcm16Base64, send]);

  // ── Web Speech API STT ─────────────────────────────────────────────────────
  const startSpeechRecognition = useCallback(async () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn("[useGeminiLive] SpeechRecognition not supported — switching to PCM streaming fallback");
      await startPcmStreaming();
      return;
    }
    if (recognitionActiveRef.current) return;

    const rec = new SpeechRec() as any;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;

    rec.onresult = (event: any) => {
      const results = Array.from(event.results);
      for (let i = event.resultIndex; i < results.length; i++) {
        const result = results[i] as any;
        if (!result) continue;
        if (result.isFinal) {
          const text = result[0]?.transcript?.trim();
          if (text && wsRef.current?.readyState === WebSocket.OPEN) {
            console.log("[useGeminiLive] STT final:", text);
            setAudioLevel(0.8); // flash mic indicator
            setTimeout(() => setAudioLevel(0), 300);
            send({ type: "text", text });
          }
        }
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error("[useGeminiLive] SpeechRecognition error:", event.error);
    };

    rec.onend = () => {
      recognitionActiveRef.current = false;
      // Auto-restart unless disconnected
      if (shouldReconnectRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        setTimeout(() => startSpeechRecognition(), 300);
      }
    };

    try {
      rec.start();
      recognitionActiveRef.current = true;
      console.log("[useGeminiLive] SpeechRecognition started");
    } catch (err) {
      console.error("[useGeminiLive] SpeechRecognition start failed:", err);
    }
  }, [send, startPcmStreaming]);

  const stopSpeechRecognition = useCallback(() => {
    recognitionActiveRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setAudioLevel(0);
    stopPcmStreaming();
  }, [stopPcmStreaming]);

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
        console.log("[useGeminiLive] WS opened — starting speech recognition");
        retryCountRef.current = 0;
        setStatus("connecting");
        if (modality !== "text") {
          void startSpeechRecognition();
        }

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
        stopSpeechRecognition();
        stopKeepalive();
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
  }, [meetingId, modality, send, startSpeechRecognition, stopSpeechRecognition, stopKeepalive, playAudioResponse]);

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
    retryCountRef.current = 99;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    stopKeepalive();
    stopSpeechRecognition();
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    stopPcmStreaming();
    setStatus("idle");
    setIsSpeaking(false);
  }, [stopSpeechRecognition, stopKeepalive, stopPcmStreaming]);

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
    audioLevel,
    connect,
    disconnect,
    sendAudioChunk,
    sendVideoFrame,
    sendText,
    setToolCallHandler,
    respondToTool,
  };
}

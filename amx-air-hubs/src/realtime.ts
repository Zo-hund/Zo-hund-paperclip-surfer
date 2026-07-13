import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export type RoomTransport = "connecting" | "websocket" | "local mesh" | "offline";
export interface RoomMessage { id: string; sender: string; text: string; timestamp: string; kind: "chat" | "presence" | "progress"; }

declare global {
  interface Window {
    __AMX_CONFIG__?: { supabaseUrl?: string; supabasePublishableKey?: string };
  }
}

function isLocalHost() {
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

export function useRealtimeRoom(code?: string) {
  const participantId = useMemo(() => sessionStorage.getItem("amx_participant") || crypto.randomUUID().slice(0, 8), []);
  const [transport, setTransport] = useState<RoomTransport>(code ? "connecting" : "offline");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const localRef = useRef<BroadcastChannel | null>(null);
  const realtimeRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const receive = useCallback((message: RoomMessage) => {
    setMessages((current) => [...current.slice(-39), message]);
    if (message.kind === "presence") setPeers((current) => Array.from(new Set([...current, message.sender])));
  }, []);

  useEffect(() => {
    sessionStorage.setItem("amx_participant", participantId);
    if (!code) { setTransport("offline"); return; }
    const room = code.toUpperCase();
    const connectLocal = () => {
      if (!("BroadcastChannel" in window)) { setTransport("offline"); return; }
      const channel = new BroadcastChannel(`amx-room-${room}`);
      localRef.current = channel;
      channel.onmessage = (event) => receive(event.data as RoomMessage);
      setTransport("local mesh");
      const presence: RoomMessage = { id: crypto.randomUUID(), sender: participantId, text: "joined the room", timestamp: new Date().toISOString(), kind: "presence" };
      receive(presence);
      channel.postMessage(presence);
    };

    const config = window.__AMX_CONFIG__;
    if (isLocalHost() || !config?.supabaseUrl || !config.supabasePublishableKey) connectLocal();
    else {
      const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      supabaseRef.current = supabase;
      const channel = supabase.channel(`amx-pod-${room}`, {
        config: { broadcast: { self: false }, presence: { key: participantId } },
      });
      realtimeRef.current = channel;
      channel
        .on("broadcast", { event: "room-message" }, ({ payload }) => receive(payload as RoomMessage))
        .on("presence", { event: "sync" }, () => setPeers(Object.keys(channel.presenceState())))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setTransport("websocket");
            void channel.track({ participantId, onlineAt: new Date().toISOString() });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setTransport("offline");
        });
    }
    return () => {
      localRef.current?.close();
      if (realtimeRef.current && supabaseRef.current) {
        void realtimeRef.current.untrack();
        void supabaseRef.current.removeChannel(realtimeRef.current);
      }
      localRef.current = null;
      realtimeRef.current = null;
      supabaseRef.current = null;
    };
  }, [code, participantId, receive]);

  const send = useCallback((text: string, kind: RoomMessage["kind"] = "chat") => {
    if (!text.trim() || !code) return;
    const message: RoomMessage = { id: crypto.randomUUID(), sender: participantId, text: text.trim(), timestamp: new Date().toISOString(), kind };
    receive(message);
    if (realtimeRef.current) void realtimeRef.current.send({ type: "broadcast", event: "room-message", payload: message });
    else localRef.current?.postMessage(message);
  }, [code, participantId, receive]);

  return { transport, messages, peers, participantId, send };
}

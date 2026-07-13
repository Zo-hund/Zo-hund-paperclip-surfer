import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RoomTransport = "connecting" | "websocket" | "local mesh" | "offline";
export interface RoomMessage { id: string; sender: string; text: string; timestamp: string; kind: "chat" | "presence" | "progress"; }

function isLocalHost() {
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

export function useRealtimeRoom(code?: string) {
  const participantId = useMemo(() => sessionStorage.getItem("amx_participant") || crypto.randomUUID().slice(0, 8), []);
  const [transport, setTransport] = useState<RoomTransport>(code ? "connecting" : "offline");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

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
      channelRef.current = channel;
      channel.onmessage = (event) => receive(event.data as RoomMessage);
      setTransport("local mesh");
      const presence: RoomMessage = { id: crypto.randomUUID(), sender: participantId, text: "joined the room", timestamp: new Date().toISOString(), kind: "presence" };
      receive(presence);
      channel.postMessage(presence);
    };
    if (isLocalHost()) connectLocal();
    else {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${location.host}/api/rooms/${encodeURIComponent(room)}?participant=${participantId}`);
      socketRef.current = socket;
      socket.onopen = () => setTransport("websocket");
      socket.onmessage = (event) => receive(JSON.parse(event.data) as RoomMessage);
      socket.onerror = () => { socket.close(); connectLocal(); };
      socket.onclose = () => setTransport((current) => current === "local mesh" ? current : "offline");
    }
    return () => { channelRef.current?.close(); socketRef.current?.close(); channelRef.current = null; socketRef.current = null; };
  }, [code, participantId, receive]);

  const send = useCallback((text: string, kind: RoomMessage["kind"] = "chat") => {
    if (!text.trim() || !code) return;
    const message: RoomMessage = { id: crypto.randomUUID(), sender: participantId, text: text.trim(), timestamp: new Date().toISOString(), kind };
    receive(message);
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify(message));
    else channelRef.current?.postMessage(message);
  }, [code, participantId, receive]);

  return { transport, messages, peers, participantId, send };
}

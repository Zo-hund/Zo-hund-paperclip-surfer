import { useEffect, useRef, useState } from "react";
import SockJS from "sockjs-client";
import { CircleStop, Clapperboard, RadioTower, RefreshCw, Video } from "lucide-react";

type Scene = { id: string; name: string };
type RpcResult = { id?: number; result?: unknown; error?: { message?: string } };

export function StreamlabsControl({ room }: { room: string }) {
  const socketRef = useRef<InstanceType<typeof SockJS> | null>(null);
  const pendingRef = useRef(new Map<number, (value: unknown) => void>());
  const idRef = useRef(1);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("DISCONNECTED");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [activeScene, setActiveScene] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => () => socketRef.current?.close(), []);

  const rpc = (resource: string, method: string, args: unknown[] = []) => new Promise<unknown>((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== SockJS.OPEN) return reject(new Error("Streamlabs is not connected"));
    const id = idRef.current++;
    pendingRef.current.set(id, resolve);
    socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params: { resource, args } }));
    window.setTimeout(() => { if (pendingRef.current.delete(id)) reject(new Error("Streamlabs did not respond")); }, 6000);
  });

  const refresh = async () => {
    const [sceneList, scene, output] = await Promise.all([
      rpc("ScenesService", "getScenes"), rpc("ScenesService", "activeScene"), rpc("StreamingService", "getModel"),
    ]) as [Scene[], Scene, { streamingStatus?: string; recordingStatus?: string }];
    setScenes(Array.isArray(sceneList) ? sceneList.map(({ id, name }) => ({ id, name })) : []);
    setActiveScene(scene?.id || "");
    setStreaming(!["offline", "stopped"].includes(String(output?.streamingStatus || "offline").toLowerCase()));
    setRecording(!["offline", "stopped"].includes(String(output?.recordingStatus || "offline").toLowerCase()));
  };

  const connect = () => {
    if (!token.trim()) return setStatus("REMOTE CONTROL TOKEN REQUIRED");
    socketRef.current?.close();
    const socket = new SockJS("http://127.0.0.1:59650/api");
    socketRef.current = socket;
    setStatus("CONNECTING");
    socket.onmessage = (event) => {
      try {
        const packet = JSON.parse(String(event.data)) as RpcResult;
        if (packet.id && pendingRef.current.has(packet.id)) {
          const resolve = pendingRef.current.get(packet.id)!;
          pendingRef.current.delete(packet.id);
          resolve(packet.result);
        }
      } catch { setStatus("INVALID DESKTOP RESPONSE"); }
    };
    socket.onerror = () => setStatus("LOCAL BRIDGE BLOCKED");
    socket.onclose = () => setStatus("DISCONNECTED");
    socket.onopen = async () => {
      try {
        await rpc("TcpServerService", "auth", [token.trim()]);
        setStatus("CONNECTED");
        await refresh();
      } catch (error) { setStatus(error instanceof Error ? error.message.toUpperCase() : "AUTH FAILED"); socket.close(); }
    };
  };

  const switchScene = async (id: string) => { await rpc("ScenesService", "makeSceneActive", [id]); setActiveScene(id); };
  const toggleOutput = async (kind: "stream" | "record") => {
    if (!window.confirm(`${kind === "stream" ? (streaming ? "Stop" : "Start") + " the live stream" : (recording ? "Stop" : "Start") + " recording"} for ${room}?`)) return;
    await rpc("StreamingService", kind === "stream" ? "toggleStreaming" : "toggleRecording");
    window.setTimeout(() => void refresh(), 900);
  };

  return <section className="stage-control-section streamlabs-control">
    <header><div><span className="eyebrow">STREAMLABS DESKTOP</span><h2>Pod show control</h2></div><span className={`stage-sync-state ${status === "CONNECTED" ? "audio-live" : ""}`}><i/>{status}</span></header>
    <div className="streamlabs-connect"><input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="REMOTE CONTROL API TOKEN"/><button onClick={connect}><RadioTower/>CONNECT</button><button onClick={() => void refresh()} disabled={status !== "CONNECTED"} aria-label="Refresh Streamlabs"><RefreshCw/></button></div>
    <p>Local-only token. Streamlabs Desktop Settings → Remote Control → Show Details. Room: <b>{room}</b></p>
    <div className="streamlabs-scenes">{scenes.map((scene) => <button key={scene.id} className={activeScene === scene.id ? "active" : ""} onClick={() => void switchScene(scene.id)}><Clapperboard/><span>{scene.name}</span></button>)}</div>
    <div className="streamlabs-output"><button className={streaming ? "live" : ""} disabled={status !== "CONNECTED"} onClick={() => void toggleOutput("stream")}>{streaming ? <CircleStop/> : <RadioTower/>}{streaming ? "STOP STREAM" : "GO LIVE"}</button><button className={recording ? "live" : ""} disabled={status !== "CONNECTED"} onClick={() => void toggleOutput("record")}>{recording ? <CircleStop/> : <Video/>}{recording ? "STOP RECORD" : "RECORD"}</button></div>
  </section>;
}

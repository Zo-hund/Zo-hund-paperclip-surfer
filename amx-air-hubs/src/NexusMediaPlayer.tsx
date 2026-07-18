import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { FileVideo, Link, Radio, Upload, Video } from "lucide-react";

type PlayerState = "idle" | "loading" | "ready" | "live" | "error";

interface Props {
  onPanelVideo?: (video: HTMLVideoElement | null) => void;
}

const HLS_DEMO = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

function safeMediaUrl(value: string) {
  const parsed = new URL(value, window.location.origin);
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && parsed.protocol !== "blob:" && !localHttp) throw new Error("Use an HTTPS media URL");
  return parsed.href;
}

export function NexusMediaPlayer({ onPanelVideo }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const objectUrlRef = useRef("");
  const [source, setSource] = useState(() => localStorage.getItem("amx_nexus_media_url") || "");
  const [activeSource, setActiveSource] = useState("");
  const [state, setState] = useState<PlayerState>("idle");
  const [message, setMessage] = useState("Load an HLS, MP4, WebM, or local video");

  const resetSource = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    onPanelVideo?.(null);
  }, [onPanelVideo]);

  useEffect(() => () => {
    hlsRef.current?.destroy();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    onPanelVideo?.(null);
  }, [onPanelVideo]);

  const load = useCallback(async (rawSource = source) => {
    const video = videoRef.current;
    if (!video) return;
    resetSource();
    setState("loading");
    setMessage("Connecting media source...");
    try {
      const url = safeMediaUrl(rawSource.trim());
      const hlsSource = /\.m3u8(?:$|[?#])/i.test(url);
      setActiveSource(url);
      if (!url.startsWith("blob:")) {
        setSource(url);
        localStorage.setItem("amx_nexus_media_url", url);
      }
      if (hlsSource) {
        const { default: HlsEngine } = await import("hls.js");
        if (!HlsEngine.isSupported() && video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = url;
          video.load();
          void video.play().catch(() => undefined);
          return;
        }
        if (!HlsEngine.isSupported()) throw new Error("This browser does not support HLS playback");
        const hls = new HlsEngine({ enableWorker: true, lowLatencyMode: true, backBufferLength: 60 });
        hlsRef.current = hls;
        hls.on(HlsEngine.Events.MANIFEST_PARSED, (_event, data) => {
          setState("ready");
          setMessage(`${data.levels.length || 1} adaptive level${data.levels.length === 1 ? "" : "s"} available`);
          onPanelVideo?.(video);
          void video.play().catch(() => setMessage("Stream ready; press play to start"));
        });
        hls.on(HlsEngine.Events.LEVEL_LOADED, (_event, data) => {
          if (data.details.live) {
            setState("live");
            setMessage("Live adaptive HLS stream connected");
          }
        });
        hls.on(HlsEngine.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          setState("error");
          setMessage(data.details || "The HLS stream could not be opened");
          onPanelVideo?.(null);
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        video.src = url;
        video.load();
        void video.play().catch(() => undefined);
      }
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The media source is invalid");
    }
  }, [onPanelVideo, resetSource, source]);

  const importFile = (file?: File) => {
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setSource(file.name);
    void load(objectUrlRef.current);
  };

  return <section className="nexus-content-module media-module">
    <div className="content-module-head"><div><span className="eyebrow">PANEL 02 / MEDIA</span><h3>Live media player</h3></div><span className={`content-state ${state}`}><i/>{state}</span></div>
    <video
      ref={videoRef}
      className="nexus-media-video"
      controls
      playsInline
      crossOrigin="anonymous"
      onLoadedMetadata={() => {
        const video = videoRef.current;
        if (!video || hlsRef.current) return;
        setState(video.duration === Infinity ? "live" : "ready");
        setMessage(video.duration === Infinity ? "Live stream connected" : "Media ready on Blender panel");
        onPanelVideo?.(video);
      }}
      onError={() => {
        if (hlsRef.current) return;
        setState("error");
        setMessage("The browser could not decode this media source");
        onPanelVideo?.(null);
      }}
    />
    <div className="media-source-row"><Link/><input aria-label="Media URL" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://.../stream.m3u8 or video.mp4"/><button onClick={() => void load()} disabled={!source.trim()} title="Load media"><Video/></button></div>
    <div className="media-source-actions">
      <button onClick={() => { setSource(HLS_DEMO); void load(HLS_DEMO); }}><Radio/>Test HLS</button>
      <label><Upload/>Local video<input type="file" accept="video/*,.m3u8" onChange={(event) => importFile(event.target.files?.[0])}/></label>
      <span><FileVideo/>{activeSource ? "Panel linked" : "No source"}</span>
    </div>
    <p>{message}</p>
  </section>;
}

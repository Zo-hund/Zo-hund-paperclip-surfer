import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, Pause, Play, ShieldCheck, Upload, Video, Volume2, VolumeX } from "lucide-react";
import { stageProgramMediaPosition, type StageProgramMediaState } from "./stage-program-media";

interface Props {
  media: StageProgramMediaState;
  tenantId: string;
  onUpdate: (media: StageProgramMediaState) => void;
}

const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export function StageProgramMediaDeck({ media, tenantId, onUpdate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState(media.url);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [message, setMessage] = useState("LOAD HTTPS VIDEO, HLS, OR A SHARED ASSET");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSource(media.url); }, [media.url]);

  const loadUrl = () => {
    const url = source.trim();
    if (!/^https:\/\//i.test(url) && !/^\/api\/media\//.test(url)) return setMessage("USE AN HTTPS MEDIA URL");
    onUpdate({ ...media, url, name: url.split("/").pop()?.split("?")[0] || "Stage media", contentType: /\.m3u8(?:$|[?#])/i.test(url) ? "application/vnd.apple.mpegurl" : "video/mp4", transport: "paused", startedAt: null, positionSeconds: 0 });
    setMessage("MEDIA SYNCED TO THE STAGE ROOM");
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!rightsConfirmed) return setMessage("RIGHTS CONFIRMATION REQUIRED");
    if (!file.type.startsWith("video/") || file.size > MAX_VIDEO_BYTES) return setMessage("USE VIDEO UP TO 25 MB");
    setBusy(true); setMessage("UPLOADING SHARED STAGE MEDIA");
    try {
      const response = await fetch("/api/media", { method: "POST", headers: { "Content-Type": file.type, "X-AMX-Filename": file.name, "X-AMX-Tenant": tenantId, "X-AMX-Media-Purpose": "stage-video", "X-AMX-Visibility": "members" }, body: file });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Video upload failed");
      onUpdate({ ...media, url: result.url, name: file.name, contentType: file.type, transport: "paused", startedAt: null, positionSeconds: 0 });
      setMessage("VIDEO READY IN WEBXR");
    } catch (error) { setMessage(error instanceof Error ? error.message.toUpperCase() : "UPLOAD FAILED"); }
    finally { setBusy(false); }
  };

  const togglePlayback = () => {
    if (!media.url) return setMessage("LOAD MEDIA FIRST");
    if (media.transport === "playing") {
      const positionSeconds = videoRef.current?.currentTime || stageProgramMediaPosition(media);
      onUpdate({ ...media, transport: "paused", startedAt: null, positionSeconds });
    } else onUpdate({ ...media, transport: "playing", startedAt: Date.now(), positionSeconds: media.positionSeconds });
  };

  return <section className="stage-control-section stage-program-media">
    <header><div><span className="eyebrow">PROGRAM MEDIA / WEBXR</span><h2>Venue screen source</h2></div><span className="stage-sync-state"><i/>{media.transport}</span></header>
    <video ref={videoRef} src={media.url || undefined} muted controls playsInline preload="metadata"/>
    <div className="stage-media-url"><Link/><input aria-label="Stage media URL" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://.../video.mp4 or stream.m3u8"/><button onClick={loadUrl} disabled={!source.trim()}>LOAD</button></div>
    <div className="stage-media-actions">
      <button onClick={togglePlayback}>{media.transport === "playing" ? <Pause/> : <Play/>}{media.transport === "playing" ? "PAUSE" : "PLAY"}</button>
      <button onClick={() => onUpdate({ ...media, muted: !media.muted })}>{media.muted ? <VolumeX/> : <Volume2/>}{media.muted ? "AUDIO OFF" : "AUDIO ON"}</button>
      <button onClick={() => onUpdate({ ...media, fit: media.fit === "contain" ? "cover" : "contain" })}><Video/>{media.fit === "contain" ? "FIT" : "FILL"}</button>
    </div>
    <div className="stage-media-upload"><label className={rightsConfirmed ? "confirmed" : ""}><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)}/><ShieldCheck/>RIGHTS CLEARED</label><label className={rightsConfirmed && !busy ? "enabled" : ""}><Upload/>{busy ? "UPLOADING" : "UPLOAD VIDEO"}<input hidden type="file" accept="video/mp4,video/webm" disabled={!rightsConfirmed || busy} onChange={(event) => void upload(event)}/></label></div>
    <p>{message}</p>
  </section>;
}

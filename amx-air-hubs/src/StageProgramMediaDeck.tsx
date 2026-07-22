import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Clapperboard, Library, Link, Pause, Play, ShieldCheck, Trash2, Upload, Video, Volume2, VolumeX, Zap } from "lucide-react";
import { stageProgramMediaPosition, type StageProgramMediaState } from "./stage-program-media";

interface Props {
  media: StageProgramMediaState;
  tenantId: string;
  onUpdate: (media: StageProgramMediaState) => void;
}

const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

interface StageMediaAsset {
  id: string;
  name: string;
  url: string;
  contentType: string;
  addedAt: number;
}

function mediaLibraryKey(tenantId: string) {
  return `amx-stage-video-library:${tenantId || "default"}`;
}

function readLibrary(tenantId: string): StageMediaAsset[] {
  try {
    const value = JSON.parse(localStorage.getItem(mediaLibraryKey(tenantId)) || "[]") as StageMediaAsset[];
    return Array.isArray(value) ? value.filter((item) => item?.id && item?.url).slice(0, 24) : [];
  } catch { return []; }
}

export function StageProgramMediaDeck({ media, tenantId, onUpdate }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState(media.url);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [message, setMessage] = useState("LOAD HTTPS VIDEO, HLS, OR A SHARED ASSET");
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<StageMediaAsset[]>(() => readLibrary(tenantId));
  const [preview, setPreview] = useState<StageMediaAsset | null>(null);

  useEffect(() => { setSource(media.url); }, [media.url]);
  useEffect(() => { setLibrary(readLibrary(tenantId)); setPreview(null); }, [tenantId]);
  useEffect(() => { localStorage.setItem(mediaLibraryKey(tenantId), JSON.stringify(library)); }, [library, tenantId]);

  const programAsset = useMemo<StageMediaAsset | null>(() => media.url ? ({ id: media.url, name: media.name, url: media.url, contentType: media.contentType, addedAt: 0 }) : null, [media.contentType, media.name, media.url]);

  const addToLibrary = (asset: StageMediaAsset) => {
    setLibrary((current) => [asset, ...current.filter((item) => item.url !== asset.url)].slice(0, 24));
    setPreview(asset);
  };

  const cue = (asset: StageMediaAsset) => {
    setPreview(asset);
    setMessage(`${asset.name.toUpperCase()} READY IN PREVIEW`);
  };

  const take = (asset = preview) => {
    if (!asset) return setMessage("CUE A LIBRARY VIDEO FIRST");
    onUpdate({ ...media, url: asset.url, name: asset.name, contentType: asset.contentType, transport: "playing", startedAt: Date.now(), positionSeconds: 0 });
    setMessage(`${asset.name.toUpperCase()} TAKEN TO PROGRAM + WEBXR`);
  };

  const loadUrl = () => {
    const url = source.trim();
    if (!/^https:\/\//i.test(url) && !/^\/api\/media\//.test(url)) return setMessage("USE AN HTTPS MEDIA URL");
    const asset = { id: crypto.randomUUID(), url, name: url.split("/").pop()?.split("?")[0] || "Stage media", contentType: /\.m3u8(?:$|[?#])/i.test(url) ? "application/vnd.apple.mpegurl" : "video/mp4", addedAt: Date.now() };
    addToLibrary(asset);
    setMessage("SAVED TO LIBRARY AND READY IN PREVIEW");
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
      addToLibrary({ id: crypto.randomUUID(), url: result.url, name: file.name, contentType: file.type, addedAt: Date.now() });
      setMessage("UPLOAD SAVED AND READY IN PREVIEW");
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
    <header><div><span className="eyebrow">CONTENT LIBRARY / WEBXR</span><h2>Preview and program</h2></div><span className="stage-sync-state"><i/>{media.transport}</span></header>
    <div className="stage-media-monitors"><div><span>PREVIEW</span><video src={preview?.url || undefined} muted controls playsInline preload="metadata"/><b>{preview?.name || "NO SOURCE CUED"}</b></div><div className="program"><span>PROGRAM</span><video ref={videoRef} src={media.url || undefined} muted controls playsInline preload="metadata"/><b>{programAsset?.name || "PROGRAM CLEAR"}</b></div></div>
    <div className="stage-media-url"><Link/><input aria-label="Stage media URL" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://.../video.mp4 or stream.m3u8"/><button onClick={loadUrl} disabled={!source.trim()}>LOAD</button></div>
    <div className="stage-media-actions">
      <button className="stage-media-take" onClick={() => take()} disabled={!preview}><Zap/>TAKE</button>
      <button onClick={togglePlayback}>{media.transport === "playing" ? <Pause/> : <Play/>}{media.transport === "playing" ? "PAUSE" : "PLAY"}</button>
      <button onClick={() => onUpdate({ ...media, muted: !media.muted })}>{media.muted ? <VolumeX/> : <Volume2/>}{media.muted ? "AUDIO OFF" : "AUDIO ON"}</button>
      <button onClick={() => onUpdate({ ...media, fit: media.fit === "contain" ? "cover" : "contain" })}><Video/>{media.fit === "contain" ? "FIT" : "FILL"}</button>
    </div>
    <div className="stage-media-upload"><label className={rightsConfirmed ? "confirmed" : ""}><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)}/><ShieldCheck/>RIGHTS CLEARED</label><label className={rightsConfirmed && !busy ? "enabled" : ""}><Upload/>{busy ? "UPLOADING" : "UPLOAD VIDEO"}<input hidden type="file" accept="video/mp4,video/webm" disabled={!rightsConfirmed || busy} onChange={(event) => void upload(event)}/></label></div>
    <div className="stage-video-library-head"><span><Library/>HOT-LOAD LIBRARY</span><b>{library.length}/24</b></div>
    <div className="stage-video-library">{library.length === 0 ? <div className="stage-video-library-empty"><Clapperboard/><span>Add an HTTPS stream or upload a video</span></div> : library.map((asset) => <article key={asset.id} className={preview?.id === asset.id ? "preview" : media.url === asset.url ? "program" : ""}><video src={asset.url} muted playsInline preload="metadata"/><span><b>{asset.name}</b><small>{asset.contentType.includes("mpegurl") ? "HLS STREAM" : "VIDEO CLIP"}</small></span><button onClick={() => cue(asset)}>CUE</button><button className="take" onClick={() => take(asset)}><Zap/>TAKE</button><button className="remove" onClick={() => setLibrary((current) => current.filter((item) => item.id !== asset.id))} aria-label={`Remove ${asset.name}`} title={`Remove ${asset.name}`}><Trash2/></button></article>)}</div>
    <p>{message}</p>
  </section>;
}

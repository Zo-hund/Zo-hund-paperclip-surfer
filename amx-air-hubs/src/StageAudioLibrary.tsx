import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { AudioLines, Disc3, LoaderCircle, Play, ShieldCheck, Sparkles, Trash2, Upload } from "lucide-react";
import {
  stageAudioDurationLabel, stageAudioTrackId, type StageAudioAsset, type StageAudioState,
} from "./stage-audio";

interface Props {
  audio: StageAudioState;
  tenantId: string;
  onUpdate: (patch: Partial<StageAudioState>) => void;
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function mediaType(file: File) {
  if (file.type.startsWith("audio/")) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  return ({ mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", webm: "audio/webm", flac: "audio/flac" } as Record<string, string>)[extension || ""] || "";
}

function readDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement("audio");
    const finish = (duration = 0) => {
      URL.revokeObjectURL(url);
      media.removeAttribute("src");
      media.load();
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    const timer = window.setTimeout(() => finish(), 5_000);
    media.preload = "metadata";
    media.onloadedmetadata = () => { window.clearTimeout(timer); finish(media.duration); };
    media.onerror = () => { window.clearTimeout(timer); finish(); };
    media.src = url;
  });
}

function sizeLabel(size: number) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function StageAudioLibrary({ audio, tenantId, onUpdate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("PRIVATE R2 LIBRARY");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = useMemo(() => audio.library.find((asset) => asset.id === previewId) || audio.library[0] || null, [audio.library, previewId]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const contentType = mediaType(file);
    if (!rightsConfirmed) return setMessage("RIGHTS CONFIRMATION REQUIRED");
    if (!contentType) return setMessage("UNSUPPORTED AUDIO FORMAT");
    if (file.size > MAX_AUDIO_BYTES) return setMessage("AUDIO EXCEEDS 25 MB");
    setBusy(true);
    setMessage("UPLOADING AUDIO");
    try {
      const [response, duration] = await Promise.all([
        fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": contentType, "X-AMX-Filename": file.name, "X-AMX-Tenant": tenantId },
          body: file,
        }),
        readDuration(file),
      ]);
      const result = await response.json().catch(() => ({})) as { id?: string; url?: string; fileName?: string; contentType?: string; size?: number; error?: string };
      if (!response.ok || !result.id || !result.url) throw new Error(result.error || "Audio upload failed");
      const asset: StageAudioAsset = {
        id: result.id,
        url: result.url,
        name: result.fileName || file.name,
        contentType: result.contentType || contentType,
        size: result.size || file.size,
        duration,
        createdAt: new Date().toISOString(),
        rightsConfirmed: true,
      };
      const track = stageAudioTrackId(asset.id);
      onUpdate({ library: [asset, ...audio.library].slice(0, 24), ...(audio.library.length ? {} : { deckA: track }) });
      setPreviewId(asset.id);
      setMessage("AUDIO READY");
    } catch (error) {
      setMessage(error instanceof Error ? error.message.toUpperCase() : "AUDIO UPLOAD FAILED");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (asset: StageAudioAsset) => {
    if (!window.confirm(`Delete ${asset.name} from the private Stage library?`)) return;
    setBusy(true);
    setMessage("DELETING AUDIO");
    try {
      const response = await fetch(asset.url, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error("Audio delete failed");
      const library = audio.library.filter((item) => item.id !== asset.id);
      const track = stageAudioTrackId(asset.id);
      onUpdate({
        library,
        deckA: audio.deckA === track ? "air-pulse" : audio.deckA,
        deckB: audio.deckB === track ? "night-grid" : audio.deckB,
        stingerTrack: audio.stingerTrack === track ? "sponsor-sting" : audio.stingerTrack,
      });
      setPreviewId((current) => current === asset.id ? library[0]?.id || null : current);
      setMessage("AUDIO DELETED");
    } catch (error) {
      setMessage(error instanceof Error ? error.message.toUpperCase() : "AUDIO DELETE FAILED");
    } finally {
      setBusy(false);
    }
  };

  return <section className="stage-control-section stage-audio-library">
    <header><div><span className="eyebrow">AUDIO LIBRARY</span><h2>Private production assets</h2></div><span className="stage-audio-library-status"><AudioLines/>{message}</span></header>
    <div className="stage-audio-upload-bar">
      <label className={rightsConfirmed ? "confirmed" : ""}><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)}/><ShieldCheck/><span>RIGHTS CLEARED</span></label>
      <button disabled={!rightsConfirmed || busy} onClick={() => inputRef.current?.click()}><Upload/>{busy ? "WORKING" : "UPLOAD TRACK"}</button>
      <input ref={inputRef} hidden type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac" onChange={(event) => void upload(event)}/>
    </div>
    {audio.library.length ? <div className="stage-audio-assets">{audio.library.map((asset) => {
      const track = stageAudioTrackId(asset.id);
      return <div key={asset.id} className={preview?.id === asset.id ? "selected" : ""}>
        <button className="stage-audio-asset-main" onClick={() => setPreviewId(asset.id)}><Disc3/><span><b>{asset.name}</b><small>{stageAudioDurationLabel(asset.duration)} / {sizeLabel(asset.size)}</small></span></button>
        <span className="stage-audio-asset-actions">
          <button className={audio.deckA === track ? "active" : ""} onClick={() => onUpdate({ deckA: track })} title="Load on Deck A" aria-label={`Load ${asset.name} on Deck A`}>A</button>
          <button className={audio.deckB === track ? "active" : ""} onClick={() => onUpdate({ deckB: track })} title="Load on Deck B" aria-label={`Load ${asset.name} on Deck B`}>B</button>
          <button className={audio.stingerTrack === track ? "active" : ""} onClick={() => onUpdate({ stingerTrack: track })} title="Set as stinger" aria-label={`Set ${asset.name} as stinger`}><Sparkles/></button>
          <button disabled={busy} onClick={() => void remove(asset)} title="Delete audio" aria-label={`Delete ${asset.name}`}><Trash2/></button>
        </span>
      </div>;
    })}</div> : <div className="stage-audio-library-empty"><AudioLines/><span><b>NO UPLOADED TRACKS</b><small>MP3, WAV, M4A, AAC, OGG, WebM or FLAC / 25 MB</small></span></div>}
    {preview && <div className="stage-audio-preview"><Play/><span><b>{preview.name}</b><small>PRIVATE PREVIEW</small></span><audio controls preload="metadata" src={preview.url}/></div>}
    {busy && <LoaderCircle className="stage-audio-busy"/>}
  </section>;
}

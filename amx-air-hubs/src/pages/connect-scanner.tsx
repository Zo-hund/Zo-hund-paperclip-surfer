import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, CameraOff, CheckCircle2, ExternalLink, ImagePlus, Link2, Radio, ScanLine, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader, StatusPill } from "../components";
import { resolveConnectionPayload, type ConnectionTarget } from "../connection-scanner";
import { publicMemberPath, useMemberAuth } from "../member-auth";

type Detector = { detect: (source: CanvasImageSource | ImageBitmap) => Promise<Array<{ rawValue?: string }>> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;
type NdefRecord = { data?: DataView; encoding?: string };
type NdefReadingEvent = Event & { message: { records: NdefRecord[] } };
type NdefReader = { scan: () => Promise<void>; write: (message: { records: Array<{ recordType: string; data: string }> }) => Promise<void>; onreading: ((event: NdefReadingEvent) => void) | null; onreadingerror: (() => void) | null };
type NdefConstructor = new () => NdefReader;
const detectorClass = () => (window as Window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
const ndefClass = () => (window as Window & { NDEFReader?: NdefConstructor }).NDEFReader;
const decodeNdef = (record?: NdefRecord) => record?.data ? new TextDecoder(record.encoding || "utf-8").decode(record.data.buffer.slice(record.data.byteOffset, record.data.byteOffset + record.data.byteLength)) : "";

export function ConnectionScannerPage() {
  const navigate = useNavigate();
  const member = useMemberAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number>(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<ConnectionTarget | null>(null);
  const [notice, setNotice] = useState("Ready to scan a member card, partner tag, pass, proof, room, or mission.");
  const canDetect = Boolean(detectorClass());
  const canNfc = Boolean(ndefClass()) && window.isSecureContext;
  const profilePath = member.profile ? publicMemberPath(member.profile) : "";
  const canWriteCard = canNfc && member.profile?.profile_visibility === "public";
  const stopCamera = () => { window.clearTimeout(scanTimer.current); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; setCameraOn(false); };
  useEffect(() => stopCamera, []);
  const accept = (payload: string, source: "QR" | "NFC" | "manual") => { const target = resolveConnectionPayload(payload, window.location.origin); if (!target) { setNotice(`The ${source} payload is not a valid HTTPS connection.`); return false; } setResult(target); setManual(payload); setNotice(`${target.label} detected by ${source}. Review before opening.`); if (source === "QR") stopCamera(); return true; };
  const scanFrame = async (detector: Detector) => { const video = videoRef.current; if (!video || !streamRef.current) return; try { if (video.readyState >= 2) { const codes = await detector.detect(video); if (codes[0]?.rawValue && accept(codes[0].rawValue, "QR")) return; } } catch { /* camera can change exposure between frames */ } scanTimer.current = window.setTimeout(() => void scanFrame(detector), 240); };
  const startCamera = async () => { const BarcodeDetector = detectorClass(); if (!BarcodeDetector) { setNotice("Live QR scanning is unavailable in this browser. Use Scan image or paste the link."); return; } stopCamera(); setResult(null); setBusy(true); try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }); streamRef.current = stream; if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); } setCameraOn(true); setNotice("Camera live. Hold the QR code inside the guide."); void scanFrame(new BarcodeDetector({ formats: ["qr_code"] })); } catch (error) { setNotice(error instanceof Error && error.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access or use Scan image." : "The camera could not be opened on this device."); } finally { setBusy(false); } };
  const scanImage = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; const BarcodeDetector = detectorClass(); if (!file || !BarcodeDetector) { setNotice("Image QR detection is unavailable in this browser. Paste the link below."); return; } setBusy(true); try { const bitmap = await createImageBitmap(file); const codes = await new BarcodeDetector({ formats: ["qr_code"] }).detect(bitmap); bitmap.close(); if (!codes[0]?.rawValue) setNotice("No QR code was found in that image."); else accept(codes[0].rawValue, "QR"); } catch { setNotice("That image could not be scanned. Try a sharper, well-lit image."); } finally { setBusy(false); event.target.value = ""; } };
  const scanNfc = async () => { const NDEFReader = ndefClass(); if (!NDEFReader) { setNotice("Web NFC is not available here. On Android, use Chrome over HTTPS."); return; } try { const reader = new NDEFReader(); reader.onreading = (event) => { const payload = decodeNdef(event.message.records[0]); payload ? accept(payload, "NFC") : setNotice("The NFC tag did not contain a readable AMX link."); }; reader.onreadingerror = () => setNotice("The NFC tag could not be read. Hold it near the top of the phone and retry."); await reader.scan(); setNotice("NFC reader active. Hold a member or partner tag near the phone."); } catch { setNotice("NFC permission was not granted or the device does not support Web NFC."); } };
  const writeCard = async () => { const NDEFReader = ndefClass(); if (!NDEFReader || !canWriteCard) { setNotice("Publish your member profile and use Android Chrome to write an NFC card."); return; } try { await new NDEFReader().write({ records: [{ recordType: "url", data: `${window.location.origin}${profilePath}` }] }); setNotice("Member card written. Tap the tag with another compatible phone to test it."); } catch { setNotice("The NFC card was not written. Keep the tag close and try again."); } };
  const openResult = () => { if (!result) return; if (result.trusted) navigate(result.href); else window.open(result.href, "_blank", "noopener,noreferrer"); };

  return <div className="page section-wrap connection-scanner-page">
    <PageHeader eyebrow="AMX TAP + SCAN" title="Member and partner connections" description="Scan trusted QR codes, tap NFC tags, and resolve AMX access without typing long links."/>
    <div className="connection-scanner-status"><StatusPill tone={window.isSecureContext ? "green" : "red"}>{window.isSecureContext ? "HTTPS READY" : "HTTPS REQUIRED"}</StatusPill><span><Camera/>{canDetect ? "QR CAMERA" : "QR FALLBACK"}</span><span><Radio/>{canNfc ? "NFC READY" : "NFC UNAVAILABLE"}</span></div>
    <div className="connection-scanner-layout">
      <section className="connection-capture"><div className={`connection-camera ${cameraOn ? "live" : ""}`}><video ref={videoRef} muted playsInline aria-label="QR scanner camera"/>{!cameraOn && <div><ScanLine/><b>Point. Tap. Connect.</b><span>Use the rear camera for member cards, partner tags, passes, proof, and room access.</span></div>}{cameraOn && <i aria-hidden="true"/>}</div>
        <div className="connection-capture-actions"><button className="button primary" disabled={busy} onClick={() => cameraOn ? stopCamera() : void startCamera()}>{cameraOn ? <><CameraOff/>Stop camera</> : <><Camera/>Scan QR</>}</button><label className={`button secondary ${busy ? "disabled" : ""}`}><ImagePlus/>Scan image<input type="file" accept="image/*" capture="environment" onChange={scanImage}/></label><button className="button secondary" onClick={() => void scanNfc()}><Radio/>Tap NFC</button></div>
        <p className="connection-notice" aria-live="polite"><Wifi/>{notice}</p></section>
      <aside className="connection-resolver"><header><div><span className="eyebrow">CONNECTION RESOLVER</span><h2>{result ? result.label : "Waiting for a connection"}</h2></div>{result?.trusted && <ShieldCheck/>}</header>
        {result ? <div className={`connection-result ${result.trusted ? "trusted" : "external"}`}><span>{result.kind.toUpperCase()}</span><p>{result.detail}</p><code>{result.href}</code><button className="button primary full" onClick={openResult}>{result.trusted ? <CheckCircle2/> : <ExternalLink/>}Open connection</button></div> : <div className="connection-empty"><Smartphone/><p>Scanned identities and access links appear here for review before opening.</p></div>}
        <form onSubmit={(event) => { event.preventDefault(); accept(manual, "manual"); }}><label><span>Paste link or code</span><div><Link2/><input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="https://www.amx-hubs.cc/..."/></div></label><button className="button secondary full">Resolve</button></form>
        <div className="connection-nfc-card"><span><Radio/><b>Near field member card</b></span><p>{member.session ? canWriteCard ? "Write your public profile to a blank NFC tag." : "Set your member profile to public to write a shareable tag." : "Sign in to write your member card to an NFC tag."}</p><button className="button secondary full" disabled={!canWriteCard} onClick={() => void writeCard()}>Write my NFC card</button></div>
      </aside>
    </div><footer className="connection-privacy"><ShieldCheck/><span><b>Private by design</b><small>Scanning occurs on this device. AMX links are classified before opening, and external destinations require confirmation.</small></span></footer>
  </div>;
}

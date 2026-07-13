import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Activity, ArrowLeft, AudioLines, Bot, Braces, CheckCircle2, CircleStop, Code2,
  File as FileIcon, FileCode2, Image, Link2, LoaderCircle, Mic, Paperclip, PlugZap, Radio,
  Send, ServerCog, ShieldCheck, Sparkles, Video, Volume2, Wrench, X,
} from "lucide-react";
import {
  builtInSkills, contentCapabilities, getAgentRuntimeStatus, invokeAgentTool, sendAgentRequest,
  type AgentAttachment, type AgentContentKind, type AgentMessage, type AgentRuntimeStatus, type AgentToolTrace,
} from "../agent-runtime";
import { useAMX } from "../AppContext";
import { AgentGlyph, StatusPill } from "../components";
import { agents } from "../data";
import { speak } from "../platform";

const MAX_INLINE_BYTES = 4 * 1024 * 1024;
const codeExtensions = new Set(["css", "glsl", "html", "js", "json", "jsx", "md", "py", "ts", "tsx", "wgsl"]);

const kindIcons = {
  text: Bot,
  audio: AudioLines,
  image: Image,
  video: Video,
  code: Code2,
  document: FileIcon,
} satisfies Record<AgentContentKind, typeof Bot>;

function attachmentKind(file: File): AgentAttachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return codeExtensions.has(extension) ? "code" : "document";
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function prepareAttachment(file: File): Promise<AgentAttachment> {
  const kind = attachmentKind(file);
  const previewUrl = URL.createObjectURL(file);
  let content: string | undefined;
  let dataUrl: string | undefined;
  if (kind === "code" || (kind === "document" && file.type.startsWith("text/"))) content = (await file.text()).slice(0, 60_000);
  else if (file.size <= MAX_INLINE_BYTES && ["audio", "image", "video"].includes(kind)) dataUrl = await readDataUrl(file);
  return {
    id: crypto.randomUUID(), kind, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size,
    previewUrl, content, dataUrl, transfer: content || dataUrl ? "inline" : "metadata",
  };
}

function byteLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentPreview({ attachment, removable, onRemove }: { attachment: AgentAttachment; removable?: boolean; onRemove?: () => void }) {
  const Icon = kindIcons[attachment.kind];
  return <figure className={`agent-attachment kind-${attachment.kind}`}>
    {attachment.kind === "image" && attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.name}/> : null}
    {attachment.kind === "video" && attachment.previewUrl ? <video src={attachment.previewUrl} controls playsInline/> : null}
    {attachment.kind === "audio" && attachment.previewUrl ? <audio src={attachment.previewUrl} controls/> : null}
    {attachment.kind === "code" && attachment.content ? <pre><code>{attachment.content.slice(0, 900)}</code></pre> : null}
    {!(["image", "video", "audio", "code"].includes(attachment.kind)) ? <span className="attachment-file-icon"><Icon/></span> : null}
    <figcaption><Icon/><span><b>{attachment.name}</b><small>{attachment.transfer} / {byteLabel(attachment.size)}</small></span></figcaption>
    {removable ? <button type="button" className="icon-button attachment-remove" onClick={onRemove} aria-label={`Remove ${attachment.name}`} title="Remove attachment"><X/></button> : null}
  </figure>;
}

function MessageRow({ message, agentName, audioEnabled }: { message: AgentMessage; agentName: string; audioEnabled: boolean }) {
  return <article className={`agent-message ${message.role}`}>
    <header><span>{message.role === "human" ? "YOU" : message.role === "agent" ? agentName : "SYSTEM"}</span><time>{new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{message.transport ? <i>{message.transport}</i> : null}</header>
    {message.text ? <p>{message.text}</p> : null}
    {message.attachments.length ? <div className="message-attachments">{message.attachments.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment}/>)}</div> : null}
    {message.role === "agent" && message.text ? <button type="button" className="message-audio" onClick={() => speak(message.text, audioEnabled)} aria-label="Play agent response" title="Play response"><Volume2/></button> : null}
  </article>;
}

function statusTone(connected: boolean) {
  return connected ? "green" as const : "gold" as const;
}

export function AgentWorkbenchPage() {
  const { agentId } = useParams();
  const agent = agents.find((item) => item.id === agentId) || agents[0];
  const { settings } = useAMX();
  const [contentKind, setContentKind] = useState<AgentContentKind>("text");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([{
    id: crypto.randomUUID(), role: "agent", text: `${agent.name} channel open. What are we building?`, contentKind: "text", attachments: [], timestamp: new Date().toISOString(), transport: "local",
  }]);
  const [traces, setTraces] = useState<AgentToolTrace[]>([]);
  const [runtime, setRuntime] = useState<AgentRuntimeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const previewUrlsRef = useRef<string[]>([]);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void getAgentRuntimeStatus().then((status) => { if (active) setRuntime(status); });
    return () => { active = false; };
  }, []);
  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: settings.reducedMotion ? "auto" : "smooth" }); }, [messages, settings.reducedMotion]);
  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const addFiles = async (files: File[]) => {
    const prepared = await Promise.all(files.slice(0, Math.max(0, 8 - attachments.length)).map(prepareAttachment));
    previewUrlsRef.current.push(...prepared.flatMap((item) => item.previewUrl ? [item.previewUrl] : []));
    setAttachments((current) => [...current, ...prepared]);
    if (prepared.length === 1) setContentKind(prepared[0].kind);
  };

  const openPicker = (accept: string) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  };

  const stopRecording = () => recorderRef.current?.stop();
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", text: "Audio capture is not supported in this browser.", contentKind: "text", attachments: [], timestamp: new Date().toISOString() }]);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        setRecording(false);
        void addFiles([new File([blob], `voice-${Date.now()}.webm`, { type: blob.type })]);
      };
      recorder.start();
      setContentKind("audio");
      setRecording(true);
    } catch {
      setRecording(false);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", text: "Microphone access was not granted. You can attach an audio file instead.", contentKind: "text", attachments: [], timestamp: new Date().toISOString() }]);
    }
  };

  const send = async () => {
    if (busy || (!prompt.trim() && !attachments.length)) return;
    const outgoing = attachments;
    const text = prompt.trim();
    const human: AgentMessage = { id: crypto.randomUUID(), role: "human", text, contentKind, attachments: outgoing, timestamp: new Date().toISOString() };
    setMessages((current) => [...current, human]);
    setPrompt("");
    setAttachments([]);
    setBusy(true);
    const response = await sendAgentRequest(agent, text, outgoing, contentKind);
    const reply: AgentMessage = {
      id: crypto.randomUUID(), role: "agent", text: response.text, contentKind: "text", attachments: [], timestamp: new Date().toISOString(), transport: response.transport, tools: response.tools,
    };
    setMessages((current) => [...current, reply]);
    setTraces((current) => [...response.tools, ...current].slice(0, 20));
    setContentKind("text");
    setBusy(false);
  };

  const runTool = async (toolName: string) => {
    const source = runtime?.tools.find((tool) => tool.name === toolName)?.source || "runtime";
    const pending: AgentToolTrace = { id: crypto.randomUUID(), name: toolName, source, status: "running", detail: "Invocation in progress", timestamp: new Date().toISOString() };
    setTraces((current) => [pending, ...current]);
    const result = await invokeAgentTool(toolName, agent.id);
    setTraces((current) => [result.trace, ...current.filter((item) => item.id !== pending.id)].slice(0, 20));
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "system", text: result.output, contentKind: "text", attachments: [], timestamp: new Date().toISOString() }]);
  };

  const connectorRows = [
    { name: "Agent Runtime", icon: Bot, connected: Boolean(runtime?.agentRuntimeConfigured), detail: runtime?.agentRuntimeConfigured ? "remote" : "browser fallback", state: runtime?.agentRuntimeConfigured ? "live" : "local" },
    { name: "Plugin Gateway", icon: PlugZap, connected: Boolean(runtime?.pluginGatewayConfigured), detail: runtime?.pluginGatewayConfigured ? "connected" : "configure", state: runtime?.pluginGatewayConfigured ? "live" : "setup" },
    { name: "MCP Gateway", icon: ServerCog, connected: Boolean(runtime?.mcpGatewayConfigured), detail: runtime?.mcpGatewayConfigured ? "connected" : "configure", state: runtime?.mcpGatewayConfigured ? "live" : "setup" },
    { name: "LiveKit Rooms", icon: Radio, connected: Boolean(runtime?.livekitConfigured), detail: runtime?.livekitConfigured ? "connected" : "local media", state: runtime?.livekitConfigured ? "live" : "local" },
  ];

  return <div className="agent-workbench page" style={{ "--agent": agent.color } as React.CSSProperties}>
    <header className="agent-workbench-header section-wrap">
      <Link to="/agents" className="back-link"><ArrowLeft/>Agent registry</Link>
      <div className="agent-workbench-identity"><AgentGlyph agent={agent} size="small"/><div><span className="eyebrow">AGENT TOOLBELT / MULTIMODAL</span><h1>{agent.name} operations</h1><p>{agent.role} / {agent.specialty}</p></div></div>
      <div className="agent-runtime-summary"><StatusPill tone={runtime?.transport === "remote" ? "green" : "cyan"}>{runtime?.transport || "checking"}</StatusPill><span><ShieldCheck/> governed</span><span><Activity/> live trace</span></div>
    </header>

    <div className="agent-workbench-grid">
      <aside className="agent-capability-rail">
        <section><span className="eyebrow">CONTENT CHANNELS</span>{contentCapabilities.map((capability) => {
          const Icon = kindIcons[capability.kind];
          return <button type="button" className={contentKind === capability.kind ? "active" : ""} key={capability.kind} onClick={() => {
            setContentKind(capability.kind);
            if (capability.kind === "audio") void startRecording();
            if (capability.kind === "image") openPicker("image/*");
            if (capability.kind === "video") openPicker("video/*");
            if (capability.kind === "document") openPicker(".glb,.gltf,.pdf,.txt,.md,.json,application/octet-stream");
          }}><Icon/><span><b>{capability.label}</b><small>{capability.detail}</small></span><CheckCircle2/></button>;
        })}</section>
        <section className="agent-skill-rail"><span className="eyebrow">LOADED SKILLS</span>{builtInSkills.map((skill) => <div key={skill}><Sparkles/><span>{skill}</span><i/></div>)}</section>
      </aside>

      <section className="agent-thread-panel">
        <div className="agent-thread-head"><div><span className="eyebrow">HUMAN + AGENT CHANNEL</span><h2>Working session</h2></div><span className="thread-security"><ShieldCheck/> private room</span></div>
        <div className="agent-thread" aria-live="polite">{messages.map((message) => <MessageRow key={message.id} message={message} agentName={agent.name} audioEnabled={settings.audioEnabled}/>)}{busy ? <div className="agent-thinking"><LoaderCircle/><span>{agent.name} is routing the task</span></div> : null}<div ref={threadEndRef}/></div>
        <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          {attachments.length ? <div className="composer-attachments">{attachments.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} removable onRemove={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}/>)}</div> : null}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); } }} placeholder={contentKind === "code" ? "Paste code or describe the engineering task" : `Message ${agent.name}`} aria-label={`Message ${agent.name}`}/>
          <div className="agent-compose-tools">
            <div>
              <button type="button" className="icon-button" onClick={() => openPicker("image/*,video/*,audio/*,.glb,.gltf,.pdf,.txt,.md,.json,.js,.jsx,.ts,.tsx,.css,.html,.glsl,.wgsl")} aria-label="Attach content" title="Attach content"><Paperclip/></button>
              <button type="button" className={`icon-button ${recording ? "recording" : ""}`} onClick={() => recording ? stopRecording() : void startRecording()} aria-label={recording ? "Stop recording" : "Record audio"} title={recording ? "Stop recording" : "Record audio"}>{recording ? <CircleStop/> : <Mic/>}</button>
              <button type="button" className={`icon-button ${contentKind === "code" ? "active" : ""}`} onClick={() => setContentKind(contentKind === "code" ? "text" : "code")} aria-label="Toggle code mode" title="Code mode"><Braces/></button>
              <span>{contentKind.toUpperCase()} / {attachments.length} ATTACHED</span>
            </div>
            <button className="button primary" disabled={busy || (!prompt.trim() && !attachments.length)}>{busy ? <LoaderCircle/> : <Send/>}Send</button>
          </div>
          <input ref={fileInputRef} type="file" hidden multiple onChange={(event) => { void addFiles(Array.from(event.target.files || [])); event.target.value = ""; }}/>
        </form>
      </section>

      <aside className="agent-tools-rail">
        <section><span className="eyebrow">CONNECTIONS</span>{connectorRows.map(({ name, icon: Icon, connected, detail, state }) => <div className="connector-row" key={name}><Icon/><span><b>{name}</b><small>{detail}</small></span><StatusPill tone={statusTone(connected)}>{state}</StatusPill></div>)}</section>
        <section><span className="eyebrow">PLUGIN + MCP TOOLS</span><div className="agent-tool-list">{(runtime?.tools || []).map((tool) => <div key={tool.name}><Wrench/><span><b>{tool.name}</b><small>{tool.source} / {tool.description}</small></span><button type="button" onClick={() => void runTool(tool.name)} disabled={!tool.available} aria-label={`Run ${tool.name}`} title={tool.available ? `Run ${tool.name}` : `${tool.name} is not connected`}><Link2/></button></div>)}</div></section>
        <section className="agent-trace-panel"><span className="eyebrow">EXECUTION TRACE</span>{traces.length ? traces.map((trace) => <div className={`trace-row ${trace.status}`} key={trace.id}><span>{trace.status === "running" ? <LoaderCircle/> : trace.status === "complete" ? <CheckCircle2/> : <FileCode2/>}</span><div><b>{trace.name}</b><small>{trace.source} / {trace.detail}</small></div></div>) : <div className="empty-trace"><Activity/><span>No tool calls in this session</span></div>}</section>
      </aside>
    </div>
  </div>;
}

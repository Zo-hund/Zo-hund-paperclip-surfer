import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import QRCode from "qrcode";
import {
  Accessibility, Activity, BadgeCheck, Bot, ChevronRight, CircleUserRound, Download,
  Home, LayoutGrid, Menu, Move3d, Radio, Settings2, ShieldCheck, ShoppingBag, Volume2, VolumeX, X, Zap,
} from "lucide-react";
import type { Agent, Mission } from "./data";
import { sponsorConfig } from "./data";
import { useAMX } from "./AppContext";
import { getOfflineQueue, syncOfflineQueue } from "./operations";

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const { xp, role, activeMission } = useAMX();
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  const nav = [
    { to: "/", label: "Home", icon: Home },
    { to: "/dashboard", label: "Dashboard", icon: Activity },
    { to: "/missions", label: "Missions", icon: Radio },
    { to: `/play/${activeMission.id}`, label: "Play", icon: Move3d },
    { to: "/agents", label: "Agents", icon: Bot },
    { to: "/wallet", label: "Proof", icon: BadgeCheck },
    { to: "/control", label: "Control", icon: LayoutGrid },
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="AMX AIR Hubs home">
          <img className="brand-mark" src="/brand/amx-air-hubs-brand.png" alt=""/>
          <span><b>AMX AIR</b><small>HUBS / XR RUNWAY</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {nav.map(({to, label, icon: Icon}) => <NavLink key={to} to={to} className={({isActive}) => isActive ? "active" : ""}><Icon size={16}/>{label}</NavLink>)}
        </nav>
        <div className="top-actions">
          <span className="role-chip">{role}</span>
          <span className="xp-chip"><Zap size={14}/>{xp.toLocaleString()} XP</span>
          <SyncBadge/>
          <button className="icon-button" title="Accessibility settings" aria-label="Accessibility settings" onClick={() => setAccessibilityOpen(true)}><Accessibility size={20}/></button>
          <button className="icon-button mobile-menu-button" title="Open menu" aria-label="Open menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21}/> : <Menu size={21}/>}</button>
        </div>
      </header>
      {menuOpen && <nav className="mobile-menu">{nav.map(({to,label,icon:Icon})=><NavLink key={to} to={to}><Icon size={18}/>{label}<ChevronRight size={16}/></NavLink>)}</nav>}
      <main>{children}</main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.slice(0,5).map(({to,label,icon:Icon})=><NavLink key={to} to={to}><Icon size={20}/><span>{label}</span></NavLink>)}
      </nav>
      {accessibilityOpen && <AccessibilityPanel onClose={() => setAccessibilityOpen(false)}/>}
    </div>
  );
}

function SyncBadge() {
  const [online,setOnline]=useState(navigator.onLine);const [queued,setQueued]=useState(getOfflineQueue().length);
  useEffect(()=>{const refresh=()=>{setOnline(navigator.onLine);setQueued(getOfflineQueue().length)};window.addEventListener("online",refresh);window.addEventListener("offline",refresh);window.addEventListener("amx:store",refresh as EventListener);return()=>{window.removeEventListener("online",refresh);window.removeEventListener("offline",refresh);window.removeEventListener("amx:store",refresh as EventListener)}},[]);
  const sync=async()=>{await syncOfflineQueue();setQueued(getOfflineQueue().length)};
  return <button className={`sync-badge ${online?"online":"offline"}`} onClick={sync} title={online?"Sync offline records":"Offline mode"}><span/>{online?(queued?`${queued} queued`:"Synced"):`${queued} offline`}</button>;
}

function AccessibilityPanel({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useAMX();
  const options: Array<{key: keyof typeof settings; label: string; detail: string}> = [
    { key: "captions", label: "Narration captions", detail: "Show every spoken instruction as text." },
    { key: "audioEnabled", label: "Agent voice", detail: "Play spoken mission guidance." },
    { key: "largeButtons", label: "Large controls", detail: "Increase tap targets across mission screens." },
    { key: "youthMode", label: "Youth mode", detail: "Require an event code and trainer approval." },
    { key: "reducedMotion", label: "Reduced motion", detail: "Minimize animation and camera movement." },
    { key: "highContrast", label: "High contrast", detail: "Increase edge and text contrast." },
    { key: "textOnlyMode", label: "Text-only mode", detail: "Replace the spatial scene with guided steps." },
  ];
  return <div className="modal-backdrop" onMouseDown={onClose}><aside className="settings-panel" onMouseDown={(event)=>event.stopPropagation()} aria-label="Accessibility settings">
    <div className="panel-heading"><div><span className="eyebrow">ACCESSIBILITY</span><h2>Mission settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X/></button></div>
    <div className="settings-list">{options.map(({key,label,detail})=><label className="setting-row" key={key}><span>{label}<small>{detail}</small></span><input type="checkbox" checked={settings[key]} onChange={(event)=>updateSettings({[key]:event.target.checked})}/><i/></label>)}</div>
    <button className="button primary full" onClick={onClose}>Apply settings</button>
  </aside></div>
}

export function PageHeader({ eyebrow, title, description, actions }: {eyebrow:string;title:string;description?:string;actions?:ReactNode}) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

export function StatusPill({ children, tone="cyan" }: {children:ReactNode;tone?:"cyan"|"gold"|"green"|"red"|"neutral"}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

export function AgentGlyph({ agent, size="large" }: {agent:Agent;size?:"small"|"large"}) {
  return <div className={`agent-glyph ${size}`} style={{"--agent":agent.color,"--accent":agent.accent} as React.CSSProperties}>
    <span className="agent-ring"/><div className="agent-head"><i/><i/></div><div className="agent-body"><b>{agent.name.slice(0,1)}</b></div>
  </div>;
}

export function AgentCard({ agent, active, locked, onSelect }: {agent:Agent;active?:boolean;locked?:boolean;onSelect:()=>void}) {
  return <button className={`agent-card ${active?"selected":""} ${locked?"locked":""}`} onClick={onSelect} disabled={locked}>
    <AgentGlyph agent={agent}/><div className="card-copy"><span className="eyebrow">{agent.voice}</span><h3>{agent.name}</h3><b>{agent.role}</b><p>{agent.specialty}</p></div><span className="select-indicator">{active ? <BadgeCheck/> : <ChevronRight/>}</span>
    {locked && <span className="agent-lock">{agent.unlockAtXP} XP</span>}</button>;
}

export function MissionCard({ mission, onOpen }: {mission:Mission;onOpen:()=>void}) {
  const agent = mission.agentId.toUpperCase();
  return <article className="mission-card" style={{"--mission":mission.color} as React.CSSProperties}>
    <div className="mission-top"><StatusPill tone={mission.access.type === "sponsored" ? "gold" : "cyan"}>{mission.access.type}</StatusPill><span>{mission.duration}</span></div>
    <div className="mission-signal"><span/><i/><b>{agent.slice(0,1)}</b></div>
    <span className="eyebrow">{mission.domain}</span><h3>{mission.title}</h3><p>{mission.description}</p>
    <div className="mission-meta"><span>{mission.difficulty}</span><span>+{mission.xp} XP</span><span>{agent}</span></div>
    <button className="button secondary full" onClick={onOpen}>Open mission <ChevronRight size={17}/></button>
  </article>;
}

export function XPBar({ value, level=3 }: {value:number;level?:number}) {
  const base = level * 500;
  const progress = Math.min(100, ((value - base) / 500) * 100);
  return <div className="xp-bar"><div className="xp-label"><span>LEVEL {level + 1}</span><b>{Math.max(0,value-base)} / 500 XP</b></div><div className="xp-track"><span style={{width:`${progress}%`}}/></div></div>;
}

export function SponsorBanner() {
  return <div className="sponsor-banner"><div className="sponsor-logo">AMX<span>LABS</span></div><div><span className="eyebrow">MISSION PARTNER</span><b>{sponsorConfig.sponsorName} funds verified learning outcomes.</b></div><Link className="button ghost" to="/sponsor">Sponsor this mission</Link></div>;
}

export function Metric({ label, value, delta, icon: Icon=Activity }: {label:string;value:string|number;delta?:string;icon?:typeof Activity}) {
  return <div className="metric"><span><Icon size={17}/>{label}</span><strong>{value}</strong>{delta && <small>{delta}</small>}</div>;
}

export function QRCodeCard({ route, title }: {route:string;title:string}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const url = typeof window === "undefined" ? route : `${window.location.origin}${route}`;
  useEffect(()=>{ if(canvas.current) QRCode.toCanvas(canvas.current,url,{width:176,margin:1,color:{dark:"#071017",light:"#f7fcff"}}); },[url]);
  const download = () => {
    if(!canvas.current) return;
    const link=document.createElement("a");link.href=canvas.current.toDataURL("image/png");link.download=`${title.toLowerCase().replace(/\s+/g,"-")}-qr.png`;link.click();
  };
  return <div className="qr-card"><canvas ref={canvas} aria-label={`QR code for ${title}`}/><div><span className="eyebrow">SCAN TO LAUNCH</span><h3>{title}</h3><code>{route}</code><button className="button secondary compact" onClick={download}><Download size={15}/>Save QR</button></div></div>;
}

export function ProofStatus({ status="Verified" }: {status?:string}) {
  return <span className="proof-status"><ShieldCheck size={16}/>{status}</span>;
}

export function EmptyState({ icon: Icon=CircleUserRound, title, body, action }: {icon?:typeof CircleUserRound;title:string;body:string;action?:ReactNode}) {
  return <div className="empty-state"><Icon size={34}/><h3>{title}</h3><p>{body}</p>{action}</div>;
}

export function VoiceIndicator({ enabled }: {enabled:boolean}) {
  return <span className="voice-indicator">{enabled?<Volume2 size={15}/>:<VolumeX size={15}/>} {enabled?"Voice on":"Muted"}</span>;
}

export function ControlCard({ icon: Icon=Settings2, title, text, to }: {icon?:typeof Settings2;title:string;text:string;to:string}) {
  return <Link to={to} className="control-card"><Icon/><div><h3>{title}</h3><p>{text}</p></div><ChevronRight/></Link>;
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppWindow, Box, CheckCircle2, Gamepad2, Glasses, Laptop, MonitorPlay, PackageCheck, ShieldCheck, Smartphone, Tablet, Wifi } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { detectInputCapabilities, type InputCapabilities } from "../interaction";
import { detectAMXDevice, portfolioApps, resolvePortfolioLaunch, type AMXDeviceFamily } from "../device-portfolio";
import { useMemberAuth } from "../member-auth";

const emptyCapabilities: InputCapabilities = {
  methods: ["mouse", "keyboard"], webXR: false, immersiveAR: false, immersiveVR: false,
  camera: false, voice: false, gamepad: false, touch: false, handTracking: false,
};

const deviceIcons: Record<AMXDeviceFamily, typeof Glasses> = {
  quest: Glasses,
  ipad: Tablet,
  chromebook: Laptop,
  laptop: Laptop,
};

export function PortfolioPage() {
  const member = useMemberAuth();
  const device = useMemo(() => detectAMXDevice(), []);
  const [capabilities, setCapabilities] = useState(emptyCapabilities);
  const [checking, setChecking] = useState(true);
  const DeviceIcon = deviceIcons[device.family];

  useEffect(() => {
    let active = true;
    void detectInputCapabilities().then((value) => {
      if (active) { setCapabilities(value); setChecking(false); }
    });
    return () => { active = false; };
  }, []);

  const canUse = (access: "member" | "operator" | "public") => access === "public" || Boolean(member.session) && (access !== "operator" || member.profile?.membership_role === "operator");

  return <div className="page section-wrap portfolio-page">
    <PageHeader eyebrow="ONE PORTFOLIO / EVERY DEVICE" title="Your AMX apps" description="Launch the right version automatically on Quest, laptop, iPad, or Chromebook. Identity, access, progress, rooms, and proof remain connected." actions={<StatusPill tone="green"><Wifi/>Synced portfolio</StatusPill>}/>

    <section className="portfolio-device" aria-live="polite">
      <div className="portfolio-device-mark"><DeviceIcon/></div>
      <div><span className="eyebrow">CURRENT DEVICE</span><h2>{device.label}</h2><p>{checking ? "Checking spatial and input capabilities..." : device.detail}</p></div>
      <div className="portfolio-capabilities">
        <span className={capabilities.webXR ? "ready" : "fallback"}><Glasses/>{capabilities.webXR ? "WebXR" : "Web 3D"}</span>
        <span className={capabilities.touch ? "ready" : "fallback"}><Smartphone/>{capabilities.touch ? "Touch" : "Keyboard"}</span>
        <span className={capabilities.gamepad || capabilities.immersiveVR ? "ready" : "fallback"}><Gamepad2/>{capabilities.gamepad || capabilities.immersiveVR ? "Controllers" : "Pointer"}</span>
      </div>
    </section>

    <div className="portfolio-heading"><div><span className="eyebrow">APP PORTFOLIO</span><h2>Ready for this device</h2></div><span>{portfolioApps.length} mounted apps</span></div>
    <section className="portfolio-grid">
      {portfolioApps.map((app) => {
        const launch = resolvePortfolioLaunch(app, device, capabilities);
        const allowed = canUse(app.access);
        return <article className="portfolio-app" key={app.id}>
          <header><span className="portfolio-app-icon">{app.id === "pathfinder" ? <Box/> : app.id === "stage" || app.id === "live-viewer" ? <MonitorPlay/> : <AppWindow/>}</span><StatusPill tone={allowed ? "green" : "gold"}>{allowed ? "available" : app.access}</StatusPill></header>
          <span className="eyebrow">{app.category}</span>
          <h3>{app.title}</h3>
          <p>{app.description}</p>
          <div className="portfolio-modes">{app.modes.map((mode) => <span key={mode}>{mode}</span>)}</div>
          <footer>
            <span><CheckCircle2/><b>{launch.status}</b></span>
            {allowed ? <Link className="button primary" to={launch.route}>{launch.mode === "webxr" ? <Glasses/> : launch.mode === "ar" ? <Smartphone/> : <AppWindow/>}{launch.label}</Link> : <Link className="button secondary" to={`/account?next=${encodeURIComponent(launch.route)}`}><ShieldCheck/>Request access</Link>}
          </footer>
        </article>;
      })}
    </section>

    <section className="portfolio-managed">
      <PackageCheck/>
      <div><span className="eyebrow">META MANAGED APP</span><h2>XR Path Finder package</h2><p><code>cc.amxairhubs.pathfinder</code> is distributed to approved Quest devices through Meta Device Manager. The portfolio provides the WebXR route when the native package is not installed.</p></div>
      <StatusPill tone="cyan">Quest 2 + 3</StatusPill>
    </section>
  </div>;
}

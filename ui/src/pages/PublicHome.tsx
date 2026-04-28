/**
 * AMX Labs — Marketing Homepage
 * Implements the AMX Labs Design System (neon-cyberpunk brand).
 * Self-contained page — uses its own Nav/Footer, not PublicLayout.
 * Route: /home  (App.tsx line 347)
 *
 * Design source: https://api.anthropic.com/v1/design/h/99_MUd2bYjxI3QTQheRFLg
 */

import React, { useState, useEffect, CSSProperties } from "react";
import {
  Radio, Cpu, Waves, ShieldCheck, Satellite, Activity,
  ArrowRight, FileText, MessageSquare,
} from "lucide-react";
import { Link } from "@/lib/router";

// ─── Shared types ──────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "ghost";

interface AmxBtnProps {
  children: React.ReactNode;
  variant?: Variant;
  icon?: React.ElementType;
  onClick?: () => void;
  to?: string;
  href?: string;
}

// ─── HUD L-corner frame ────────────────────────────────────────────────────────

function HUDFrame({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  const corner = (pos: CSSProperties): CSSProperties => ({
    position: "absolute",
    width: 14,
    height: 14,
    borderColor: "var(--amx-cyan)",
    filter: "drop-shadow(0 0 4px rgba(39,232,251,0.7))",
    ...pos,
  });
  return (
    <div style={{ position: "relative", ...style }}>
      <div style={corner({ top: 0, left: 0, borderTop: "1px solid", borderLeft: "1px solid" })} />
      <div style={corner({ top: 0, right: 0, borderTop: "1px solid", borderRight: "1px solid" })} />
      <div style={corner({ bottom: 0, left: 0, borderBottom: "1px solid", borderLeft: "1px solid" })} />
      <div style={corner({ bottom: 0, right: 0, borderBottom: "1px solid", borderRight: "1px solid" })} />
      {children}
    </div>
  );
}

// ─── Neon button ───────────────────────────────────────────────────────────────

function AmxBtn({ children, variant = "primary", icon: Icon, onClick, to, href }: AmxBtnProps) {
  const [hov, setHov] = useState(false);

  const base: CSSProperties = {
    fontFamily: "var(--amx-font-display)",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    fontSize: 11,
    fontWeight: 600,
    padding: "10px 18px",
    borderRadius: 6,
    cursor: "pointer",
    transition: "all 140ms var(--amx-ease-out)",
    border: "1px solid transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    textDecoration: "none",
    background: "transparent",
  };

  const variants: Record<Variant, CSSProperties> = {
    primary: {
      background: hov ? "var(--amx-cyan-bright)" : "var(--amx-cyan)",
      color: "#011220",
      boxShadow: hov ? "var(--amx-glow-cyan-md)" : "var(--amx-glow-cyan-sm)",
      borderColor: "transparent",
    },
    secondary: {
      background: "transparent",
      color: hov ? "var(--amx-cyan)" : "var(--amx-ink-8)",
      borderColor: hov ? "var(--amx-cyan)" : "var(--amx-border-default)",
      boxShadow: hov ? "var(--amx-glow-cyan-sm)" : "none",
    },
    ghost: {
      background: hov ? "rgba(39,232,251,0.06)" : "transparent",
      color: hov ? "var(--amx-cyan)" : "var(--amx-ink-6)",
      borderColor: "transparent",
    },
  };

  const content = (
    <>
      {children}
      {Icon && <Icon size={13} strokeWidth={1.5} />}
    </>
  );

  const style = { ...base, ...variants[variant] };

  if (to) {
    return (
      <Link
        to={to}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={style}
      >
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={style}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={style}
    >
      {content}
    </button>
  );
}

// ─── Nav ───────────────────────────────────────────────────────────────────────

function AmxNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 6);
    window.addEventListener("scroll", on);
    on();
    return () => window.removeEventListener("scroll", on);
  }, []);

  const links = [
    { label: "Platform", href: "#platform" },
    { label: "Systems", href: "#systems" },
    { label: "Research", href: "#research" },
    { label: "Company", to: "/p/company/amx-labs" },
  ];

  return (
    <nav style={{
      position: "sticky",
      top: 0,
      zIndex: 50,
      padding: "14px 48px",
      background: scrolled ? "rgba(7,11,28,0.72)" : "transparent",
      backdropFilter: scrolled ? "blur(16px)" : "none",
      WebkitBackdropFilter: scrolled ? "blur(16px)" : "none",
      borderBottom: scrolled ? "1px solid var(--amx-border-subtle)" : "1px solid transparent",
      transition: "all 260ms var(--amx-ease-out)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      {/* Logo */}
      <Link to="/home" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
        <img
          src="/amx-glyph.svg"
          alt="AMX Labs"
          style={{ height: 30, filter: "drop-shadow(0 0 8px rgba(39,232,251,0.5))" }}
        />
        <span style={{
          fontFamily: "var(--amx-font-display)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.22em",
          fontSize: 16,
          background: "var(--amx-grad-wordmark)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        }}>
          AMX LABS
        </span>
      </Link>

      {/* Links */}
      <div style={{ display: "flex", gap: 28, alignItems: "center" }}>
        {links.map((l) => (
          <Link key={l.label} to={l.to ?? `/home${l.href ?? ""}`} style={{
            fontFamily: "var(--amx-font-display)",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "var(--amx-ink-6)",
            fontWeight: 500,
            textDecoration: "none",
          }}>{l.label}</Link>
        ))}
      </div>

      {/* CTAs */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Link to="/request" style={{
          fontFamily: "var(--amx-font-display)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          color: "var(--amx-ink-5)",
          padding: "8px 14px",
          textDecoration: "none",
        }}>
          Sign in
        </Link>
        <AmxBtn to="/request" icon={ArrowRight}>Request access</AmxBtn>
      </div>
    </nav>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

function AmxHero() {
  return (
    <section style={{ position: "relative", padding: "64px 48px 96px", overflow: "hidden" }}>
      {/* Ambient glow */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 800px 500px at 30% 40%, rgba(39,232,251,0.10), transparent 60%), radial-gradient(ellipse 700px 500px at 75% 80%, rgba(255,39,255,0.08), transparent 60%)",
        pointerEvents: "none",
      }} />

      <HUDFrame style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 40px", minHeight: 520 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 60, alignItems: "center" }}>
          {/* Glyph */}
          <div style={{ textAlign: "center" as const }}>
            <img
              src="/amx-glyph.svg"
              alt="AMX Labs"
              style={{
                width: "100%",
                maxWidth: 380,
                filter: "drop-shadow(0 0 30px rgba(39,232,251,0.45)) drop-shadow(0 0 50px rgba(255,39,255,0.35))",
                animation: "amx-breathe 2.2s ease-in-out infinite",
              }}
            />
          </div>

          {/* Copy */}
          <div>
            <div style={{
              fontFamily: "var(--amx-font-mono)",
              fontSize: 12,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--amx-cyan)",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amx-cyan)", boxShadow: "var(--amx-glow-cyan-sm)", display: "inline-block" }} />
              R&amp;D · ISSUE 004
            </div>

            <h1 style={{
              fontFamily: "var(--amx-font-display)",
              fontSize: 64,
              margin: "0 0 24px",
              color: "var(--amx-ink-8)",
              letterSpacing: "0.08em",
              lineHeight: 1.05,
              textTransform: "uppercase",
            }}>
              Innovate.<br />
              <span style={{
                background: "var(--amx-grad-brand-h)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
              }}>
                Integrate. Illuminate.
              </span>
            </h1>

            <p style={{ fontSize: 18, color: "var(--amx-ink-6)", maxWidth: 520, marginBottom: 32, lineHeight: 1.6 }}>
              Instrument-grade systems for teams working at the edge of what works.
              Built for precision. Engineered to ship.
            </p>

            <div style={{ display: "flex", gap: 14 }}>
              <AmxBtn to="/request" icon={ArrowRight}>Enter the lab</AmxBtn>
              <AmxBtn to="/pricing" variant="secondary" icon={FileText}>Read the paper</AmxBtn>
            </div>
          </div>
        </div>
      </HUDFrame>

      {/* Status ticker bar */}
      <div style={{
        maxWidth: 1280, margin: "40px auto 0", padding: "16px 40px",
        display: "flex", justifyContent: "space-between",
        fontFamily: "var(--amx-font-mono)", fontSize: 11,
        color: "var(--amx-ink-5)", letterSpacing: "0.15em", textTransform: "uppercase",
        borderTop: "1px solid var(--amx-border-subtle)", borderBottom: "1px solid var(--amx-border-subtle)",
      }}>
        <span>T-07 : 04:22:09</span>
        <span>CH.02 LINK ESTABLISHED</span>
        <span>λ = 488 NM</span>
        <span>v1.4.0</span>
        <span style={{ color: "var(--amx-cyan)" }}>● LIVE</span>
      </div>
    </section>
  );
}

// ─── Spec Strip ────────────────────────────────────────────────────────────────

function AmxSpecStrip() {
  const specs = [
    { k: "JITTER",   v: "< 0.8", u: "ms" },
    { k: "CHANNELS", v: "256",   u: "concurrent" },
    { k: "UPTIME",   v: "99.997",u: "%" },
    { k: "LATENCY",  v: "3.2",   u: "ms p99" },
    { k: "DEPLOYS",  v: "12k+",  u: "sites" },
  ];
  return (
    <section id="systems" style={{
      padding: "48px 48px", maxWidth: 1280, margin: "0 auto",
      borderTop: "1px solid var(--amx-border-subtle)",
      borderBottom: "1px solid var(--amx-border-subtle)",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${specs.length}, 1fr)`, gap: 12 }}>
        {specs.map((s, i) => (
          <div key={s.k} style={{ padding: "0 24px", borderLeft: i === 0 ? "none" : "1px solid var(--amx-border-subtle)" }}>
            <div style={{ fontFamily: "var(--amx-font-mono)", fontSize: 10, letterSpacing: "0.2em", color: "var(--amx-ink-5)", marginBottom: 8 }}>{s.k}</div>
            <div style={{ fontFamily: "var(--amx-font-display)", fontSize: 40, color: "var(--amx-cyan)", lineHeight: 1, letterSpacing: "0.02em", textShadow: "var(--amx-glow-cyan-sm)" }}>{s.v}</div>
            <div style={{ fontFamily: "var(--amx-font-mono)", fontSize: 11, color: "var(--amx-ink-6)", marginTop: 8, letterSpacing: "0.08em" }}>{s.u}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Capability Grid ───────────────────────────────────────────────────────────

interface CapCard { num: string; icon: React.ElementType; title: string; body: string }

function CapabilityCard({ num, icon: Icon, title, body }: CapCard) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: "relative",
        background: "var(--amx-ink-2)",
        border: `1px solid ${hov ? "var(--amx-border-glow-cyan)" : "var(--amx-border-subtle)"}`,
        borderRadius: 14, padding: 28, overflow: "hidden",
        boxShadow: hov ? "var(--amx-glow-cyan-sm), var(--amx-shadow-2)" : "var(--amx-shadow-2)",
        transition: "all 260ms var(--amx-ease-out)",
        transform: hov ? "translateY(-2px)" : "none",
      }}
    >
      {/* Top-edge gradient bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--amx-grad-brand-h)", opacity: hov ? 0.95 : 0.45, transition: "opacity 260ms" }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <Icon size={32} strokeWidth={1.5} style={{ color: hov ? "var(--amx-cyan)" : "var(--amx-ink-6)", filter: hov ? "drop-shadow(0 0 6px rgba(39,232,251,0.6))" : "none", transition: "all 260ms" }} />
        <span style={{ fontFamily: "var(--amx-font-mono)", fontSize: 11, color: "var(--amx-ink-5)", letterSpacing: "0.1em" }}>{num}</span>
      </div>
      <h4 style={{ fontFamily: "var(--amx-font-display)", fontSize: 20, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--amx-ink-8)", margin: "0 0 12px" }}>{title}</h4>
      <p style={{ fontSize: 14, color: "var(--amx-ink-6)", lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  );
}

function AmxCapabilityGrid() {
  const caps: CapCard[] = [
    { num: "001", icon: Radio,       title: "Signal",    body: "Capture, filter, and route high-throughput telemetry across distributed channels with sub-millisecond jitter." },
    { num: "002", icon: Cpu,         title: "Compute",   body: "On-edge inference stacks built for instrument-class latency. Deterministic under load." },
    { num: "003", icon: Waves,       title: "Synthesis", body: "Composable waveform primitives. Drive arrays, simulate fields, close the loop in real time." },
    { num: "004", icon: ShieldCheck, title: "Integrity", body: "Signed every step. Reproducible builds, auditable runs, no black boxes between probe and paper." },
    { num: "005", icon: Satellite,   title: "Link",      body: "Wire AMX into your existing bench — gRPC, MQTT, OPC UA, or raw TCP. Your stack, not ours." },
    { num: "006", icon: Activity,    title: "Observe",   body: "Live dashboards with a timescale that goes from nanoseconds to months. Zoom without reload." },
  ];
  return (
    <section id="research" style={{ padding: "96px 48px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontFamily: "var(--amx-font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--amx-ink-5)", marginBottom: 14 }}>§ Capabilities</div>
        <h2 style={{ fontFamily: "var(--amx-font-display)", fontSize: 48, margin: 0, color: "var(--amx-ink-8)", letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.05, maxWidth: 780 }}>
          Systems. Signals.{" "}
          <span style={{ background: "var(--amx-grad-brand-h)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>Results.</span>
        </h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {caps.map((c) => <CapabilityCard key={c.num} {...c} />)}
      </div>
    </section>
  );
}

// ─── Platform Section ──────────────────────────────────────────────────────────

function AmxPlatformSection() {
  const [tab, setTab] = useState(0);
  const tabs = ["Overview", "Signal", "Compute", "Link"];
  const readouts: [string, string, string][] = [["AMP", "0.482", "V"], ["FREQ", "2.44", "GHz"], ["PHASE", "+12.7", "°"], ["SNR", "38.1", "dB"]];

  return (
    <section id="platform" style={{ padding: "96px 48px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 60, alignItems: "center" }}>
        {/* Copy + tabs */}
        <div>
          <div style={{ fontFamily: "var(--amx-font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--amx-ink-5)", marginBottom: 14 }}>§ Platform</div>
          <h3 style={{ fontFamily: "var(--amx-font-display)", fontSize: 40, margin: "0 0 20px", color: "var(--amx-ink-8)", letterSpacing: "0.06em", lineHeight: 1.1 }}>
            Precision at the<br />speed of thought.
          </h3>
          <p style={{ fontSize: 16, color: "var(--amx-ink-6)", lineHeight: 1.65, marginBottom: 28, maxWidth: 460 }}>
            AMX runs as a single binary on your bench, your rack, or our cloud.
            Same instrumentation surface. Same guarantees. Same shape of output, whatever you point it at.
          </p>
          <div style={{ display: "flex", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
            {tabs.map((t, i) => (
              <button key={t} onClick={() => setTab(i)} style={{
                fontFamily: "var(--amx-font-display)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
                padding: "8px 14px",
                background: tab === i ? "rgba(39,232,251,0.08)" : "transparent",
                color: tab === i ? "var(--amx-cyan)" : "var(--amx-ink-5)",
                border: `1px solid ${tab === i ? "var(--amx-border-glow-cyan)" : "var(--amx-border-default)"}`,
                borderRadius: 6, cursor: "pointer",
                boxShadow: tab === i ? "var(--amx-glow-cyan-sm)" : "none",
                transition: "all 140ms var(--amx-ease-out)",
              }}>{t}</button>
            ))}
          </div>
          <AmxBtn to="/request" variant="secondary" icon={ArrowRight}>Explore the platform</AmxBtn>
        </div>

        {/* Instrument panel */}
        <HUDFrame style={{ background: "var(--amx-ink-1)", borderRadius: 14, padding: 28, minHeight: 420 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid var(--amx-border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3DE0B3", boxShadow: "0 0 8px rgba(61,224,179,0.7)", display: "inline-block" }} />
              <span style={{ fontFamily: "var(--amx-font-mono)", fontSize: 11, color: "var(--amx-ink-7)", letterSpacing: "0.15em" }}>{tabs[tab].toUpperCase()} · CH.02</span>
            </div>
            <span style={{ fontFamily: "var(--amx-font-mono)", fontSize: 11, color: "var(--amx-ink-5)" }}>T-07 : 04:22:09</span>
          </div>

          {/* Waveform SVG */}
          <div style={{ height: 120, position: "relative", marginBottom: 18, overflow: "hidden" }}>
            <svg viewBox="0 0 500 120" style={{ width: "100%", height: "100%" }}>
              <defs>
                <linearGradient id="amx-wf" x1="0" x2="1">
                  <stop offset="0" stopColor="#27E8FB" /><stop offset="1" stopColor="#FF27FF" />
                </linearGradient>
              </defs>
              {[...Array(5)].map((_, i) => (
                <line key={i} x1="0" y1={24 * (i + 1)} x2="500" y2={24 * (i + 1)} stroke="rgba(74,84,150,0.18)" strokeWidth="1" />
              ))}
              <path d="M0,60 Q25,20 50,60 T100,60 T150,60 T200,60 Q225,100 250,60 T300,60 T350,60 Q375,30 400,60 T450,60 T500,60"
                fill="none" stroke="url(#amx-wf)" strokeWidth="1.8"
                style={{ filter: "drop-shadow(0 0 6px rgba(39,232,251,0.7))" }} />
            </svg>
          </div>

          {/* Readouts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
            {readouts.map(([k, v, u]) => (
              <div key={k} style={{ background: "var(--amx-ink-2)", border: "1px solid var(--amx-border-subtle)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontFamily: "var(--amx-font-mono)", fontSize: 9, letterSpacing: "0.15em", color: "var(--amx-ink-5)", marginBottom: 4 }}>{k}</div>
                <div style={{ fontFamily: "var(--amx-font-mono)", fontSize: 18, color: "var(--amx-cyan)", textShadow: "var(--amx-glow-cyan-sm)" }}>
                  {v}<span style={{ fontSize: 11, color: "var(--amx-ink-6)", marginLeft: 4 }}>{u}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Log lines */}
          <div style={{ background: "var(--amx-ink-0)", border: "1px solid var(--amx-border-subtle)", borderRadius: 6, padding: "10px 14px", fontFamily: "var(--amx-font-mono)", fontSize: 11, lineHeight: 1.7, color: "var(--amx-ink-6)" }}>
            <div><span style={{ color: "var(--amx-ink-5)" }}>04:22:07 </span><span style={{ color: "var(--amx-cyan)" }}>link</span> established · ch.02</div>
            <div><span style={{ color: "var(--amx-ink-5)" }}>04:22:08 </span><span style={{ color: "#3DE0B3" }}>ok</span> calibration drift 0.02%</div>
            <div><span style={{ color: "var(--amx-ink-5)" }}>04:22:09 </span><span style={{ color: "var(--amx-ink-7)" }}>stream</span> 256 ch · 12.4 Gbps</div>
          </div>
        </HUDFrame>
      </div>
    </section>
  );
}

// ─── Ticker ────────────────────────────────────────────────────────────────────

function AmxTicker() {
  const items = ["INNOVATE", "INTEGRATE", "ILLUMINATE", "AMX LABS", "R&D · ISSUE 004", "SYSTEMS · SIGNALS · RESULTS"];
  const content = [...items, ...items, ...items];
  return (
    <section style={{ borderTop: "1px solid var(--amx-border-subtle)", borderBottom: "1px solid var(--amx-border-subtle)", padding: "20px 0", overflow: "hidden", background: "var(--amx-ink-1)" }}>
      <div style={{ display: "flex", gap: 48, whiteSpace: "nowrap", animation: "amx-ticker 40s linear infinite", fontFamily: "var(--amx-font-display)", fontSize: 22, textTransform: "uppercase", letterSpacing: "0.22em" }}>
        {content.map((t, i) => (
          <React.Fragment key={i}>
            <span style={{ color: i % 3 === 1 ? "var(--amx-cyan)" : i % 3 === 2 ? "var(--amx-magenta)" : "var(--amx-ink-6)", textShadow: i % 3 === 1 ? "var(--amx-glow-cyan-sm)" : i % 3 === 2 ? "var(--amx-glow-magenta-sm)" : "none" }}>
              {t}
            </span>
            <span style={{ color: "var(--amx-ink-5)" }}>●</span>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

// ─── CTA ───────────────────────────────────────────────────────────────────────

function AmxCTA() {
  return (
    <section style={{ padding: "96px 48px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 700px 400px at 50% 50%, rgba(39,232,251,0.12), transparent 60%), radial-gradient(ellipse 600px 400px at 50% 50%, rgba(255,39,255,0.10), transparent 70%)", pointerEvents: "none" }} />
      <HUDFrame style={{ maxWidth: 1040, margin: "0 auto", padding: "72px 48px", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--amx-font-mono)", fontSize: 11, letterSpacing: "0.2em", color: "var(--amx-cyan)", marginBottom: 20, textTransform: "uppercase" }}>
          ▸ Ready when you are
        </div>
        <h2 style={{ fontFamily: "var(--amx-font-display)", fontSize: 56, margin: "0 0 20px", color: "var(--amx-ink-8)", letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.05 }}>
          Enter{" "}
          <span style={{ background: "var(--amx-grad-brand-h)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>
            the lab.
          </span>
        </h2>
        <p style={{ fontSize: 18, color: "var(--amx-ink-6)", maxWidth: 560, margin: "0 auto 36px", lineHeight: 1.6 }}>
          Credentials are issued weekly to qualified teams. Bring a problem. Leave with a spec.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
          <AmxBtn to="/request" icon={ArrowRight}>Request access</AmxBtn>
          <AmxBtn to="/request" variant="ghost" icon={MessageSquare}>Talk to engineering</AmxBtn>
        </div>
      </HUDFrame>
    </section>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────────

function AmxFooter() {
  const cols = [
    {
      h: "Platform",
      links: [
        { label: "Signal", to: "/home#systems" },
        { label: "Compute", to: "/home#platform" },
        { label: "Synthesis", to: "/home#research" },
        { label: "Link", to: "/request" },
      ],
    },
    {
      h: "Company",
      links: [
        { label: "About", to: "/p/company/amx-labs" },
        { label: "Research", to: "/home#research" },
        { label: "Careers", to: "/request" },
        { label: "Press", to: "/request" },
      ],
    },
    {
      h: "Resources",
      links: [
        { label: "Docs", to: "/pricing" },
        { label: "Papers", to: "/pricing" },
        { label: "Status", to: "/home#platform" },
        { label: "Contact", to: "/request" },
      ],
    },
  ];
  return (
    <footer style={{ padding: "64px 48px 32px", borderTop: "1px solid var(--amx-border-subtle)", background: "var(--amx-ink-0)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 48, marginBottom: 48 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <img src="/amx-glyph.svg" alt="AMX Labs" style={{ height: 28, filter: "drop-shadow(0 0 6px rgba(39,232,251,0.4))" }} />
            <span style={{ fontFamily: "var(--amx-font-display)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.22em", fontSize: 14, background: "var(--amx-grad-wordmark)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>
              AMX LABS
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--amx-ink-5)", lineHeight: 1.6, maxWidth: 320, margin: 0 }}>
            Innovate. Integrate. Illuminate. Instrument-grade systems for teams at the edge of what works.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <div style={{ fontFamily: "var(--amx-font-mono)", fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--amx-ink-5)", marginBottom: 14 }}>{c.h}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {c.links.map((l) => (
                <Link key={l.label} to={l.to} style={{ fontSize: 13, color: "var(--amx-ink-6)", textDecoration: "none" }}>{l.label}</Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1280, margin: "0 auto", paddingTop: 24, borderTop: "1px solid var(--amx-border-subtle)", display: "flex", justifyContent: "space-between", fontFamily: "var(--amx-font-mono)", fontSize: 11, color: "var(--amx-ink-5)", letterSpacing: "0.1em" }}>
        <span>© 2026 AMX LABS · ALL SYSTEMS NOMINAL</span>
        <span>v1.4.0 · build 04221</span>
      </div>
    </footer>
  );
}

// ─── Page root ─────────────────────────────────────────────────────────────────

export function PublicHome() {
  return (
    <div style={{ background: "var(--amx-ink-0)", color: "var(--amx-ink-7)", minHeight: "100vh", overflowX: "hidden" }}>
      <AmxNav />
      <AmxHero />
      <AmxSpecStrip />
      <AmxCapabilityGrid />
      <AmxPlatformSection />
      <AmxTicker />
      <AmxCTA />
      <AmxFooter />
    </div>
  );
}

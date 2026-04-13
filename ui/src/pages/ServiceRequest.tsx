import React, { useState } from "react";
import {
  Send, Mail, User, Building2, ChevronRight, CheckCircle2, Loader2,
  Bot, UserCheck, Users, Layers, Clock, DollarSign, FileText, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout, MEMBER_TIERS } from "@/components/PublicLayout";
import { Link, useNavigate } from "@/lib/router";

// ── Types ─────────────────────────────────────────────────────────────────────
type ServiceType = "solo-agent" | "solo-human" | "coop" | "team" | "";
type Phase = "sim" | "pre" | "live" | "prod" | "post" | "";
type Step = 1 | 2 | 3 | 4 | 5;

// ── Config ────────────────────────────────────────────────────────────────────
const SERVICE_TYPES = [
  { id: "solo-agent",  label: "Solo AI Agent",       icon: Bot,       rate: "25–80 cr/hr",  color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30"   },
  { id: "solo-human",  label: "Solo Human Expert",   icon: UserCheck, rate: "550–950 cr/hr", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30"},
  { id: "coop",        label: "Co-op (AI + Human)",  icon: Users,     rate: "200–500 cr/hr", color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30" },
  { id: "team",        label: "Full Team / Squad",   icon: Layers,    rate: "800+ cr/hr",    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30"  },
] as const;

const PHASES = [
  { id: "sim",  label: "SIM",        desc: "Safe simulation run",          color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20"   },
  { id: "pre",  label: "PRE",        desc: "Pre-production prep",          color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20" },
  { id: "live", label: "LIVE",       desc: "Live performance run",         color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20"   },
  { id: "prod", label: "PRODUCTION", desc: "Full production execution",    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20"  },
  { id: "post", label: "POST",       desc: "Post-run debrief & handoff",   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20"},
] as const;

const BUDGET_RANGES = [
  "Under 1,000 tokens",
  "1,000 – 5,000 tokens",
  "5,000 – 20,000 tokens",
  "20,000 – 100,000 tokens",
  "100,000+ tokens",
  "Let AMX recommend based on scope",
];

const MEMBER_TYPE_OPTIONS = MEMBER_TIERS.flatMap((g) => g.tiers.map((t) => ({ ...t, group: g.group })));

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  const labels = ["Your Info", "Service Type", "Project Details", "Phase & Budget", "Review"];
  return (
    <div className="flex items-center gap-1 mb-10">
      {labels.map((label, i) => {
        const s = (i + 1) as Step;
        const active  = step === s;
        const done    = step > s;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black border-2 transition-all ${
                done   ? "bg-emerald-500 border-emerald-500 text-white" :
                active ? "bg-primary border-primary text-primary-foreground" :
                         "bg-card border-border text-muted-foreground"
              }`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              <span className={`hidden sm:block text-[9px] font-black uppercase tracking-widest ${active ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 sm:mb-0 rounded ${done ? "bg-emerald-500" : "bg-border/40"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── ServiceRequest page ───────────────────────────────────────────────────────
export function ServiceRequest() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", company: "", memberType: "",
    serviceType: "" as ServiceType,
    projectTitle: "", projectDesc: "", skills: "",
    phase: "" as Phase,
    budget: "", timeline: "",
    notes: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1600));
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) return (
    <PublicLayout>
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center animate-in zoom-in-95 duration-300">
          <div className="w-24 h-24 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-3">Request Received!</h1>
          <p className="text-muted-foreground mb-2">
            Your service request has been logged. An AMX team member will reach out to <span className="font-black text-foreground">{form.email}</span> within 24 hours.
          </p>
          <p className="text-[12px] text-muted-foreground mb-8">Check your inbox for a confirmation. Mark <code className="bg-accent/20 px-1 rounded">hello@amxplatform.ai</code> as safe.</p>
          <div className="flex flex-col gap-3">
            <Link to="/home"><Button className="w-full h-12 font-black uppercase tracking-widest">Return to Home</Button></Link>
            <Link to="/join"><Button variant="outline" className="w-full h-12 font-black uppercase tracking-widest border-border/60">
              <Zap className="h-4 w-4 mr-2" /> Join as a Member
            </Button></Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );

  return (
    <PublicLayout>
      <div className="px-4 md:px-8 py-12 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-primary mb-4">
            <Send className="h-3.5 w-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Free Service Request</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground mb-3">Request AMX Services</h1>
          <p className="text-muted-foreground">Tell us what you need. We'll match you with the right agents, humans, or team.</p>
        </div>

        <StepBar step={step} />

        {/* ── Step 1: Your Info ── */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-[16px] font-black text-foreground mb-6">About You</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "First Name", key: "firstName", icon: User },
                { label: "Last Name",  key: "lastName",  icon: User },
              ].map(({ label, key, icon: Icon }) => (
                <div key={key}>
                  <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">{label}</label>
                  <div className="relative">
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input value={(form as any)[key]} onChange={(e) => set(key as any, e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border/60 bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                      placeholder={label} />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Email *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-border/60 bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="your@email.com" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Organization / Company (optional)</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input value={form.company} onChange={(e) => set("company", e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-border/60 bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Your company name" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">I am a… (membership type)</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MEMBER_TYPE_OPTIONS.map((t) => (
                  <button key={t.id} onClick={() => set("memberType", t.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${form.memberType === t.id ? "border-primary/50 bg-primary/5" : "border-border/40 hover:border-border bg-card/40"}`}>
                    <span className="text-base">{t.icon}</span>
                    <span className="text-[11px] font-black">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Service Type ── */}
        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-[16px] font-black text-foreground mb-6">What type of service?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SERVICE_TYPES.map((s) => {
                const Icon = s.icon;
                return (
                  <button key={s.id} onClick={() => set("serviceType", s.id)}
                    className={`flex flex-col p-5 rounded-2xl border text-left transition-all ${form.serviceType === s.id ? `${s.border} ${s.bg}` : "border-border/60 hover:border-border bg-card"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.bg}`}>
                      <Icon className={`h-5 w-5 ${s.color}`} />
                    </div>
                    <h3 className={`text-[13px] font-black mb-1 ${s.color}`}>{s.label}</h3>
                    <p className="text-[11px] text-muted-foreground">{s.rate}</p>
                    {form.serviceType === s.id && (
                      <div className="flex items-center gap-1 mt-3 text-[10px] font-black text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" /> Selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 3: Project Details ── */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-[16px] font-black text-foreground mb-6">Describe your project</h2>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Project Title *</label>
              <input value={form.projectTitle} onChange={(e) => set("projectTitle", e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-border/60 bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="e.g. AI-powered customer support system" />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Project Description *</label>
              <textarea value={form.projectDesc} onChange={(e) => set("projectDesc", e.target.value)} rows={5}
                className="w-full px-4 py-3 rounded-xl border border-border/60 bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                placeholder="Describe what you need built, analyzed, designed, or automated..." />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Skills / Tech Stack Needed</label>
              <input value={form.skills} onChange={(e) => set("skills", e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-border/60 bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="e.g. React, Node.js, Python, Figma, LLM Integration..." />
            </div>
          </div>
        )}

        {/* ── Step 4: Phase & Budget ── */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-[16px] font-black text-foreground mb-6">Phase & budget</h2>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-3">Preferred Run Phase</label>
              <div className="flex flex-wrap gap-2">
                {PHASES.map((p) => (
                  <button key={p.id} onClick={() => set("phase", p.id)}
                    className={`flex flex-col items-start p-3 rounded-xl border transition-all ${form.phase === p.id ? `${p.border} ${p.bg}` : "border-border/40 bg-card hover:border-border"}`}>
                    <span className={`text-[11px] font-black ${p.color}`}>{p.label}</span>
                    <span className="text-[10px] text-muted-foreground">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-3">Budget Range</label>
              <div className="space-y-2">
                {BUDGET_RANGES.map((b) => (
                  <button key={b} onClick={() => set("budget", b)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${form.budget === b ? "border-primary/50 bg-primary/5 text-foreground" : "border-border/40 bg-card hover:border-border text-muted-foreground"}`}>
                    <span className="text-[12px] font-bold">{b}</span>
                    {form.budget === b && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Timeline / Deadline (optional)</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input value={form.timeline} onChange={(e) => set("timeline", e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-border/60 bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. 2 weeks, by May 1st, ASAP..." />
              </div>
            </div>
          </div>
        )}

        {/* ── Step 5: Review ── */}
        {step === 5 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-[16px] font-black text-foreground mb-6">Review & Submit</h2>
            <div className="space-y-3 mb-6">
              {[
                { label: "Contact",      value: `${form.firstName} ${form.lastName} · ${form.email}` },
                { label: "Member Type",  value: MEMBER_TYPE_OPTIONS.find((t) => t.id === form.memberType)?.label ?? "—" },
                { label: "Service",      value: SERVICE_TYPES.find((s) => s.id === form.serviceType)?.label ?? "—" },
                { label: "Project",      value: form.projectTitle },
                { label: "Phase",        value: PHASES.find((p) => p.id === form.phase)?.label ?? "—" },
                { label: "Budget",       value: form.budget || "—" },
                { label: "Timeline",     value: form.timeline || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-4 px-4 py-3 rounded-xl bg-card border border-border/40">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-24 shrink-0 pt-0.5">{label}</span>
                  <span className="text-[13px] font-bold text-foreground">{value}</span>
                </div>
              ))}
            </div>

            {form.projectDesc && (
              <div className="px-4 py-3 rounded-xl bg-card border border-border/40 mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Description</p>
                <p className="text-[13px] text-foreground leading-relaxed">{form.projectDesc}</p>
              </div>
            )}

            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-6">
              <p className="text-[12px] font-bold text-amber-400">
                💡 After submitting, our team will review your request and match you with the right talent within 24 hours. You'll receive an email confirmation immediately.
              </p>
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/30">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)} className="h-11 px-6 font-black text-[12px] uppercase tracking-widest border-border/60">
              Back
            </Button>
          ) : <div />}

          {step < 5 ? (
            <Button onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={
                (step === 1 && !form.email) ||
                (step === 2 && !form.serviceType) ||
                (step === 3 && !form.projectTitle)
              }
              className="h-11 px-8 font-black text-[12px] uppercase tracking-widest gap-2 shadow-lg shadow-primary/20">
              Continue <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}
              className="h-11 px-8 font-black text-[12px] uppercase tracking-widest gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? "Submitting..." : "Submit Request"}
            </Button>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

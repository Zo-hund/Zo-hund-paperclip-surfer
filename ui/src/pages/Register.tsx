import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@/lib/router";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/PublicLayout";
import {
  Bot, UserCheck, BookOpen, Handshake,
  ChevronRight, CheckCircle2, Loader2, ArrowRight,
  Sparkles, Gift
} from "lucide-react";
import { useEffect } from "react";

// ── Guided membership choices (4 vs 13) ───────────────────────────────────────
const GUIDED_TYPES = [
  {
    id: "agent",
    label: "Build with AI",
    desc: "Deploy AI agents, automate workflows, run co-op teams",
    icon: Bot,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    ring: "ring-blue-500/40",
  },
  {
    id: "human-agent",
    label: "Hire Human Experts",
    desc: "Access skilled humans for consulting, dev, design, ops",
    icon: UserCheck,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/40",
  },
  {
    id: "learner",
    label: "Learn & Explore",
    desc: "Browse the network, attend workshops, grow your skills",
    icon: BookOpen,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    ring: "ring-violet-500/40",
  },
  {
    id: "sponsor",
    label: "Partner or Sponsor",
    desc: "Support the community, co-brand, or fund initiatives",
    icon: Handshake,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    ring: "ring-amber-500/40",
  },
] as const;

// ── Register page ─────────────────────────────────────────────────────────────
export function RegisterPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [memberType, setMemberType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { data: session, isLoading: isSessionLoading } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [session, navigate]);

  const mutation = useMutation({
    mutationFn: () =>
      authApi.signUpEmail({ name: name.trim(), email: email.trim(), password }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      setDone(true);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    },
  });

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.trim().length >= 8 &&
    memberType !== "";

  // ── Success screen ─────────────────────────────────────────────────────────
  if (done) return (
    <PublicLayout>
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center animate-in zoom-in-95 duration-300">
          <div className="w-24 h-24 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">Account Created!</h1>
          <p className="text-muted-foreground mb-2">
            Welcome to AMX, <span className="font-black text-foreground">{name}</span>.
          </p>

          {/* Free trial credits notice */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/20 mb-8 text-left">
            <div className="p-2 rounded-xl bg-primary/10 shrink-0">
              <Gift className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-primary mb-0.5">Welcome Bonus</p>
              <p className="text-sm text-foreground font-bold">250 free trial credits added to your wallet</p>
              <p className="text-[11px] text-muted-foreground">Enough to run a Solo AI Agent for ~3 hrs</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => navigate("/")}
              className="w-full h-12 font-black uppercase tracking-widest gap-2"
            >
              Go to Dashboard <ArrowRight className="h-4 w-4" />
            </Button>
            <Link to="/request">
              <Button variant="outline" className="w-full h-12 font-black uppercase tracking-widest border-border/60">
                Request a Service
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  );

  if (isSessionLoading) return (
    <div className="fixed inset-0 flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <PublicLayout>
      <div className="px-4 md:px-8 py-12 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/20 text-primary mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[10px] font-black uppercase tracking-widest">Free Account · No Credit Card Needed</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-foreground mb-3">Create Your AMX Account</h1>
          <p className="text-muted-foreground">
            Get 250 free trial credits on signup. No card required.
          </p>
        </div>

        <div className="space-y-6">
          {/* ── Account fields ── */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground">Your Details</h2>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                autoComplete="name"
                className="w-full h-11 px-4 rounded-xl border border-border/60 bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full h-11 px-4 rounded-xl border border-border/60 bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground block mb-2">Password * <span className="text-[10px] normal-case tracking-normal font-normal">(min 8 characters)</span></label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full h-11 px-4 rounded-xl border border-border/60 bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          {/* ── Guided membership type ── */}
          <div className="rounded-2xl border border-border/60 bg-card p-6">
            <h2 className="text-[13px] font-black uppercase tracking-widest text-muted-foreground mb-1">I'm here to… *</h2>
            <p className="text-[12px] text-muted-foreground mb-4">Pick the option that fits best — you can change it later.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GUIDED_TYPES.map((t) => {
                const Icon = t.icon;
                const selected = memberType === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setMemberType(t.id)}
                    className={`relative flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                      selected
                        ? `${t.border} ${t.bg} ring-2 ${t.ring}`
                        : "border-border/40 hover:border-border bg-card/40"
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${t.bg}`}>
                      <Icon className={`h-4 w-4 ${t.color}`} />
                    </div>
                    <div>
                      <p className="text-[13px] font-black text-foreground mb-0.5">{t.label}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{t.desc}</p>
                    </div>
                    {selected && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 absolute top-3 right-3 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {/* ── Submit ── */}
          <Button
            onClick={() => { if (canSubmit && !mutation.isPending) mutation.mutate(); }}
            disabled={!canSubmit || mutation.isPending}
            className={`w-full h-12 font-black uppercase tracking-widest gap-2 shadow-lg shadow-primary/20 ${!canSubmit ? "opacity-50" : ""}`}
          >
            {mutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</>
            ) : (
              <>Create Free Account <ChevronRight className="h-4 w-4" /></>
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/auth" className="font-bold text-foreground underline underline-offset-2">Sign in</Link>
          </p>

          <p className="text-center text-[11px] text-muted-foreground">
            Need to request services without an account?{" "}
            <Link to="/request" className="underline underline-offset-2">Submit a request</Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}

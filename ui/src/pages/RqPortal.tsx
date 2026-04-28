import * as React from "react";
import {
  Factory,
  Cpu,
  Layers,
  Workflow,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Dna,
  Package,
  Activity,
  History,
  Send,
  Sparkles,
  LayoutDashboard,
  X,
  Database,
  Wallet,
  PieChart,
  UserCheck,
  TrendingUp,
  Loader2,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { amxApi } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { useNavigate } from "@/lib/router";
import { DeliverablesBriefcase } from "@/components/DeliverablesBriefcase";

/* ─── Data ─────────────────────────────────────────────────────────────────── */

const TIERS = [
  {
    id: 1,
    slug: "starter",
    name: "Digital Foundation",
    price: "$1,000",
    description:
      "Essential Digital Presence. Perfect for solopreneurs and startups looking to establish their digital presence with AI-powered automation.",
    features: [
      "Context Setup & Brand Voice Definition",
      "Social Media Automation (3x/week)",
      "4 AI-Generated Blog Posts/Month",
      "LinkedIn/Twitter Agent Deployment",
      "Certificate of Services (Basic Auth)",
      "Online Dashboard Access",
    ],
    deliverables: ["Social Content", "Blog Posts", "Certificate"],
    deployment: "Online",
    color: "primary",
  },
  {
    id: 2,
    slug: "pro",
    name: "Hybrid Growth",
    price: "$2,000",
    description:
      "Growth & Physical Presence. For growing SMBs ready to scale with web development, print materials, and video content.",
    features: [
      "Everything in Tier 1",
      "Context-Aware Landing Page + Chatbot",
      "Print-Ready Marketing Materials",
      "Business Cards & Banner Designs",
      "AI-Generated Video Scripts & Avatars",
      "Verified Smart Certificate",
      "Physical + Online Deployment",
    ],
    deliverables: ["Social", "Web", "Print", "Video", "Certificate"],
    deployment: "Online + Physical",
    color: "emerald-500",
    popular: true,
  },
  {
    id: 3,
    slug: "enterprise",
    name: "Metaverse Enterprise",
    price: "$3,000",
    description:
      "Full Scale Domination. Forward-thinking brands ready for XR, digital twins, and metaverse presence.",
    features: [
      "Everything in Tier 2",
      "Custom Virtual Booth on xrexpo.space",
      "3D Product Models (Metaverse-Ready)",
      "Geospatial Digital Twin",
      "Microsoft Teams Integration (TeamsFx)",
      "AR Features for In-Person Events",
      "Gold Standard Certification + NFT Mint",
      "All Deployment Modes",
    ],
    deliverables: [
      "Social",
      "Web",
      "Print",
      "Video",
      "3D Models",
      "Digital Twin",
      "Certificate",
    ],
    deployment: "Online + Physical + Metaverse",
    color: "amber-500",
  },
];

const AGENTS = [
  { name: "Strategy Agent", role: "GPT-4 powered planning & copy", icon: Cpu },
  { name: "Visual Agent", role: "Fal.ai image generation", icon: Sparkles },
  { name: "Spatial Agent", role: "Hunyuan3D for 3D models", icon: Globe },
  { name: "Document Agent", role: "PDF generation & formatting", icon: Package },
  { name: "Content Agent", role: "Copywriting & SEO optimization", icon: Dna },
];

const TIER_COSTS: Record<string, { credits: number; tokens: number }> = {
  starter:    { credits: 50,  tokens: 10 },
  pro:        { credits: 120, tokens: 25 },
  enterprise: { credits: 300, tokens: 60 },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  submitted:         { label: "Submitted",         color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  activating_agents: { label: "Activating Agents", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  review:            { label: "In Review",         color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  deploying:         { label: "Deploying",         color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  certified:         { label: "Certified",         color: "text-green-400 bg-green-400/10 border-green-400/20" },
};

/* ─── Sub-components ────────────────────────────────────────────────────────── */

interface RecentSubmission {
  id: string;
  issueIdentifier: string;
  tier: string;
  tierName: string;
  status: string;
  companyPrefix: string;
  createdAt: string;
}

function LifecycleStepper({ isSimulation }: { isSimulation: boolean }) {
  const steps = [
    { id: "pre",  label: "Pre-Production",  always: true  },
    { id: "sim",  label: "Simulation",      sim: true     },
    { id: "prod", label: "Production",      sim: false    },
    { id: "live", label: "Live Performance",always: false, postSim: true },
    { id: "post", label: "Post-Production", always: true  },
  ];

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2 scrollbar-none">
      {steps.map((step, idx) => {
        const isActive =
          step.always ||
          (step.sim !== undefined && step.sim === isSimulation) ||
          (step.postSim && !isSimulation);
        const isSkipped = step.sim !== undefined && step.sim !== isSimulation;

        return (
          <React.Fragment key={step.id}>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${
                isSkipped
                  ? "text-muted-foreground/30 border border-dashed border-border/30"
                  : isActive
                  ? "text-primary bg-primary/10 border border-primary/30 shadow-sm"
                  : "text-muted-foreground/50 border border-border/30"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isSkipped ? "bg-muted-foreground/20" : isActive ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
              {step.label}
            </div>
            {idx < steps.length - 1 && (
              <ChevronRight
                className={`h-3 w-3 shrink-0 mx-0.5 ${
                  isActive ? "text-primary/40" : "text-border/40"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ActiveRqBanner({
  submissions,
  companyPrefix,
  onDismiss,
}: {
  submissions: RecentSubmission[];
  companyPrefix: string;
  onDismiss: (id: string) => void;
}) {
  const navigate = useNavigate();
  if (submissions.length === 0) return null;

  return (
    <section className="px-4 md:px-8 py-4 bg-accent/5 border-b border-border/40">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Active Manufacturing Requests
          </span>
        </div>
        <div className="flex flex-wrap gap-3">
          {submissions.map((sub) => {
            const statusInfo = STATUS_LABELS[sub.status] ?? STATUS_LABELS.submitted;
            const tierInfo = TIERS.find((t) => t.slug === sub.tier);
            return (
              <div
                key={sub.id}
                className="flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-2xl bg-card border border-border/60 shadow-sm hover:border-primary/30 transition-all"
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        navigate(`/${companyPrefix}/issues/${sub.issueIdentifier}`)
                      }
                      className="text-[12px] font-black text-primary hover:underline"
                    >
                      {sub.issueIdentifier}
                    </button>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {tierInfo?.name ?? sub.tierName}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border w-fit mt-1 ${statusInfo.color}`}
                  >
                    {statusInfo.label}
                  </span>
                </div>
                <button
                  onClick={() => onDismiss(sub.id)}
                  className="p-1 hover:bg-accent rounded-full transition-colors ml-1 shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */

export function RqPortal() {
  const { selectedCompanyId, companies } = useCompany();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [modalSuccess, setModalSuccess] = React.useState<RecentSubmission | null>(null);
  const [activeTier, setActiveTier] = React.useState<(typeof TIERS)[0] | null>(null);
  const [isSimulation, setIsSimulation] = React.useState(true);
  const [contextFormData, setContextFormData] = React.useState({
    userContext: "",
    domainContext: "",
    institutionalMemory: "",
  });
  const [recentSubmissions, setRecentSubmissions] = React.useState<RecentSubmission[]>([]);

  const tiersRef = React.useRef<HTMLElement>(null);

  const companyPrefix =
    React.useMemo(() => {
      if (!selectedCompanyId) return "AMXA";
      return (
        companies.find((c) => c.id === selectedCompanyId)?.issuePrefix ?? "AMXA"
      );
    }, [selectedCompanyId, companies]);

  const wallet = { credits: 2450, tokens: 420, extensionFactor: "100x" };

  const scrollToTiers = () => {
    tiersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleOpenModal = (tier: (typeof TIERS)[0]) => {
    setActiveTier(tier);
    setModalSuccess(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalSuccess(null);
    setContextFormData({ userContext: "", domainContext: "", institutionalMemory: "" });
  };

  // Derived cost/balance
  const tierCost = activeTier ? (TIER_COSTS[activeTier.slug] ?? { credits: 0, tokens: 0 }) : null;
  const currentCost = tierCost ? (isSimulation ? tierCost.credits : tierCost.tokens) : 0;
  const currentBalance = isSimulation ? wallet.credits : wallet.tokens;
  const isInsufficientBalance = currentCost > currentBalance;

  // Context completion percentages (drive orbital visualization)
  const userContextPct = Math.min(100, Math.round((contextFormData.userContext.length / 200) * 100));
  const domainContextPct = Math.min(100, Math.round((contextFormData.domainContext.length / 200) * 100));
  const memoryPct = Math.min(100, Math.round((contextFormData.institutionalMemory.length / 200) * 100));

  const handleSubmit = async () => {
    if (!selectedCompanyId || !activeTier) return;
    setSubmitting(true);
    try {
      const result = (await amxApi.submitRq(selectedCompanyId, {
        tier: activeTier.slug,
        contextData: contextFormData,
        isSimulation,
        deploymentMode: activeTier.deployment.toLowerCase().includes("physical")
          ? "hybrid"
          : "cloud",
      })) as { id?: string; issueIdentifier?: string; status?: string } | null;

      const newSub: RecentSubmission = {
        id: result?.id ?? crypto.randomUUID(),
        issueIdentifier: result?.issueIdentifier ?? `${companyPrefix}-?`,
        tier: activeTier.slug,
        tierName: activeTier.name,
        status: result?.status ?? "submitted",
        companyPrefix,
        createdAt: new Date().toISOString(),
      };

      setRecentSubmissions((prev) => [newSub, ...prev].slice(0, 3));
      setModalSuccess(newSub);

      // Auto-close after 4s
      setTimeout(() => {
        handleCloseModal();
      }, 4000);
    } catch {
      pushToast({
        tone: "error",
        title: "Submission Failed",
        body: "There was an error processing your RQ. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {/* Hero Section */}
      <section className="relative px-4 md:px-8 py-12 md:py-20 border-b border-border/40 bg-accent/5 overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-64 md:w-96 h-64 md:h-96 bg-primary/20 blur-[100px] rounded-full animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-64 md:w-96 h-64 md:h-96 bg-emerald-500/20 blur-[100px] rounded-full animate-pulse duration-700" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-primary/10 text-primary shadow-inner">
                <Factory className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-foreground uppercase italic underline decoration-primary/30 decoration-8 underline-offset-8">
                  CONTEXT AI FACTORY
                </h1>
                <p className="text-[10px] font-black tracking-[0.4em] text-muted-foreground uppercase mt-2 ml-1">
                  Manufacturing Industrial Intelligence
                </p>
              </div>
            </div>

            {/* Wallet Dashboard */}
            <div className="flex items-center gap-4 bg-card/80 backdrop-blur-md p-4 rounded-3xl border border-border/60 shadow-xl">
              <div className="flex flex-col px-4 border-r border-border/40">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-500" /> Digital Twin Capacity
                </span>
                <span className="text-2xl font-black text-foreground">
                  {wallet.extensionFactor}{" "}
                  <span className="text-[10px] text-primary">Extension</span>
                </span>
              </div>
              <div className="flex flex-col px-4 border-r border-border/40">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                  <PieChart className="h-3 w-3 text-primary" /> Learning Credits
                </span>
                <span className="text-2xl font-black text-foreground">
                  {wallet.credits.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col px-4">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                  <Wallet className="h-3 w-3 text-amber-500" /> Prod Tokens
                </span>
                <span className="text-2xl font-black text-foreground">
                  {wallet.tokens.toLocaleString()}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-2xl border-primary/20 bg-primary/5 hover:bg-primary/10 font-bold text-[10px] uppercase tracking-widest px-4 h-10"
                onClick={scrollToTiers}
              >
                Buy Credit Block
              </Button>
            </div>
          </div>

          <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-foreground mb-6 leading-tight max-w-4xl">
            Context AI Factory:{" "}
            <span className="text-primary block md:inline">AI Speed + Human Touch</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground font-medium max-w-3xl leading-relaxed">
            Submit your Requirement (RQ) and let our Context AI Factory manufacture
            intelligence tailored to your business. From social media to metaverse
            presence, we deliver agency-grade services at a fraction of the cost.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-8 md:mt-12">
            <Button
              size="lg"
              className="h-14 px-8 gap-3 font-black text-[13px] uppercase tracking-[0.2em] shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
              onClick={scrollToTiers}
            >
              Submit Your RQ
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-8 gap-3 font-black text-[13px] uppercase tracking-[0.2em] border-border/60"
              onClick={scrollToTiers}
            >
              Explore Service Tiers
              <History className="h-5 w-5 shrink-0" />
            </Button>
          </div>
        </div>
      </section>

      {/* Active RQ Banner */}
      <ActiveRqBanner
        submissions={recentSubmissions}
        companyPrefix={companyPrefix}
        onDismiss={(id) =>
          setRecentSubmissions((prev) => prev.filter((s) => s.id !== id))
        }
      />

      {/* Lifecycle Stepper */}
      <section className="px-4 md:px-8 py-4 bg-background border-b border-border/40">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground shrink-0">
              Pipeline
            </span>
            <LifecycleStepper isSimulation={isSimulation} />
          </div>
        </div>
      </section>

      {/* Tiers Section */}
      <section
        ref={tiersRef}
        id="tiers"
        className="px-4 md:px-8 py-12 md:py-20 bg-background scroll-mt-4"
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center text-center mb-10 md:mb-16">
            <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">
              Service Tiers
            </h2>
            <h3 className="text-3xl md:text-4xl font-black text-foreground">
              Choose Your Manufacturing Level
            </h3>
            <div className="w-12 h-1 bg-primary rounded-full mt-6" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`group relative flex flex-col rounded-2xl border ${
                  tier.popular
                    ? "border-primary shadow-[0_0_40px_rgba(var(--primary-rgb),0.1)] scale-105"
                    : "border-border/60"
                } bg-card hover:border-primary/40 transition-all duration-300 p-8`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-[0.1em] z-10 shadow-lg">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <h4 className="text-2xl font-black text-foreground group-hover:text-primary transition-colors">
                    {tier.name}
                  </h4>
                  <div className="text-4xl font-black text-primary mt-2">{tier.price}</div>
                  <p className="text-[13px] text-muted-foreground mt-4 leading-relaxed font-medium">
                    {tier.description}
                  </p>
                </div>

                <div className="flex-1 space-y-4 mb-8">
                  <div className="flex flex-col gap-3">
                    {tier.features.map((feature, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 text-[13px] font-medium text-foreground/80"
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Cost preview on card */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-accent/30 border border-border/40">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {isSimulation ? "Credits" : "Tokens"}
                    </span>
                    <span className="text-sm font-black text-foreground">
                      {isSimulation
                        ? TIER_COSTS[tier.slug].credits
                        : TIER_COSTS[tier.slug].tokens}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">
                      Deliverables
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {tier.deliverables.map((item) => (
                        <span
                          key={item}
                          className="px-2.5 py-1 rounded-full bg-accent/40 text-[10px] font-bold text-foreground/80 border border-border/40"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">
                      Deployment
                    </span>
                    <div className="flex items-center gap-2 text-[12px] font-bold text-foreground">
                      <Globe className="h-3.5 w-3.5 text-primary" />
                      {tier.deployment}
                    </div>
                  </div>

                  <Button
                    onClick={() => handleOpenModal(tier)}
                    disabled={submitting}
                    className={`w-full h-12 font-black text-[12px] uppercase tracking-[0.2em] ${
                      tier.popular ? "shadow-lg shadow-primary/20" : ""
                    }`}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Submit RQ"
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div id="briefcase" className="mt-20 border-t border-border/40 pt-20">
            <div className="flex flex-col items-center text-center mb-12">
              <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">
                Manufactured Intelligence
              </h2>
              <h3 className="text-3xl md:text-5xl font-black text-foreground mb-6">
                Briefcase: Live Factory Deliverables
              </h3>
              <p className="text-base md:text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
                Track every deliverable manufactured by your Context AI Swarm.
                Complete measurement and direct access to your digital assets.
              </p>
            </div>
            <DeliverablesBriefcase />
          </div>
        </div>
      </section>

      {/* Agent Workforce Section */}
      <section className="px-4 md:px-8 py-16 md:py-24 bg-accent/5 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">
                The Agentic Workforce
              </h2>
              <h3 className="text-3xl md:text-5xl font-black text-foreground mb-6 md:mb-8">
                Powered by the AMX Agent Swarm
              </h3>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-medium mb-8 md:mb-10 max-w-xl">
                Our specialized AI agents work in parallel to manufacture your
                intelligence at industrial scales. Each agent is tuned for specific
                roles in the context continuum.
              </p>

              <div className="flex flex-col gap-6">
                {AGENTS.map((agent) => (
                  <div
                    key={agent.name}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-card/50 hover:border-primary/30 hover:bg-card transition-all group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-all duration-300">
                      <agent.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-black text-foreground">
                        {agent.name}
                      </h4>
                      <p className="text-[12px] text-muted-foreground font-medium">
                        {agent.role}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative aspect-square w-full max-w-sm mx-auto lg:max-w-none mt-10 lg:mt-0">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-full border border-primary/20 rounded-full animate-[spin_20s_linear_infinite]" />
                <div className="absolute w-[80%] h-[80%] border border-primary/40 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                <div className="absolute w-[60%] h-[60%] border border-primary/60 rounded-full animate-[spin_10s_linear_infinite]" />

                <div className="absolute p-10 bg-background rounded-full border-2 border-primary shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)] animate-pulse">
                  <Factory className="h-12 w-12 text-primary" />
                </div>

                {[0, 72, 144, 216, 288].map((degree, idx) => (
                  <div
                    key={idx}
                    className="absolute"
                    style={{ transform: `rotate(${degree}deg) translateY(-40%)` }}
                  >
                    <div
                      className="w-14 h-14 bg-card border border-primary/40 rounded-xl flex items-center justify-center text-primary shadow-lg animate-bounce"
                      style={{ animationDelay: `${idx * 0.2}s` }}
                    >
                      {React.createElement(AGENTS[idx].icon, { className: "h-6 w-6" })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Context Indicators — driven by real form state */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-full max-w-sm p-6 rounded-2xl bg-card border border-border shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  <span className="text-[12px] font-black uppercase tracking-widest">
                    Context Loading
                  </span>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "User Context", pct: userContextPct },
                    { label: "Domain Context", pct: domainContextPct },
                    { label: "Inst. Memory", pct: memoryPct },
                  ].map(({ label, pct }) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                        {label}
                      </span>
                      <div className="flex-1 h-1.5 bg-accent rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground w-7 text-right">
                        {pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="px-4 md:px-8 py-12 md:py-20 bg-background">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <div className="flex flex-col items-center text-center mb-12 md:mb-16">
            <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">
              How It Works
            </h2>
            <h3 className="text-3xl md:text-4xl font-black text-foreground">
              Four Simple Steps from Requirement to Delivery
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-4 w-full">
            {[
              {
                step: "1",
                title: "Submit Your RQ",
                desc: "Tell us your requirements, upload brand assets, and choose your deployment mode.",
                icon: Send,
              },
              {
                step: "2",
                title: "AI Agents Activate",
                desc: "Our AI agent swarm begins processing your request through high-context workflows.",
                icon: Workflow,
              },
              {
                step: "3",
                title: "Review & Refine",
                desc: "Track real-time progress. Review deliverables and request adjustments.",
                icon: LayoutDashboard,
              },
              {
                step: "4",
                title: "Deploy & Certify",
                desc: "Receive deliverables across all modes and get a blockchain-verified PoW Certificate.",
                icon: ShieldCheck,
              },
            ].map((s, idx) => (
              <div
                key={idx}
                className="relative p-8 rounded-2xl border border-border/40 bg-accent/5 hover:border-primary/40 transition-all text-center group"
              >
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-[12px] font-black text-primary">
                  {s.step}
                </div>
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <s.icon className="h-6 w-6" />
                </div>
                <h4 className="text-[14px] font-black text-foreground mb-2 uppercase tracking-wide">
                  {s.title}
                </h4>
                <p className="text-[12px] text-muted-foreground font-medium leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>

          <Button
            size="lg"
            className="w-full sm:w-auto h-14 md:h-16 px-6 md:px-12 mt-12 md:mt-20 gap-3 font-black text-[12px] md:text-[15px] uppercase tracking-[0.2em] md:tracking-[0.3em] shadow-2xl shadow-primary/40 transition-all hover:scale-105 active:scale-95 whitespace-normal sm:whitespace-nowrap py-4"
            onClick={scrollToTiers}
          >
            Ready to Transform Your Business?
            <Zap className="h-5 w-5 md:h-6 md:w-6 shrink-0" />
          </Button>
        </div>
      </section>

      {/* Context Intake Modal */}
      {isModalOpen && activeTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg bg-card border border-border/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">

            {/* Modal header */}
            <div className="p-6 border-b border-border/40 flex items-center justify-between bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-foreground uppercase tracking-tight">
                    Context Intake
                  </h3>
                  <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
                    {activeTier.name}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-accent rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Success state */}
            {modalSuccess ? (
              <div className="p-8 flex flex-col items-center gap-5 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-foreground mb-1">
                    Manufacturing Initiated
                  </h4>
                  <p className="text-sm text-muted-foreground font-medium">
                    Your agent swarm is activating.
                  </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary/10 border border-primary/20">
                  <span className="text-sm font-black text-primary">
                    {modalSuccess.issueIdentifier}
                  </span>
                </div>
                <Button
                  onClick={() => {
                    navigate(`/${companyPrefix}/issues/${modalSuccess.issueIdentifier}`);
                    handleCloseModal();
                  }}
                  className="gap-2 font-black text-[11px] uppercase tracking-widest"
                >
                  Track in Paperclip
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Auto-closing in a moment...
                </p>
              </div>
            ) : (
              <div className="p-8 space-y-6">
                {/* Simulation Mode Toggle */}
                <div className="p-4 rounded-2xl bg-accent/5 border border-border/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg transition-colors ${
                        isSimulation
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-amber-500/10 text-amber-500"
                      }`}
                    >
                      {isSimulation ? (
                        <Sparkles className="h-4 w-4" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                        Deployment Mode
                      </span>
                      <span className="text-sm font-black text-foreground">
                        {isSimulation
                          ? "Simulation (Learning Credits)"
                          : "Live Performance (Production Tokens)"}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isSimulation ? "outline" : "default"}
                    className={`h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest ${
                      isSimulation
                        ? "border-emerald-500/30 text-emerald-500"
                        : "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                    }`}
                    onClick={() => setIsSimulation(!isSimulation)}
                  >
                    {isSimulation ? "Switch to Live" : "Switch to Sim"}
                  </Button>
                </div>

                {/* Form fields */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                      Domain Context <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      className="w-full min-h-[90px] p-4 rounded-2xl bg-accent/5 border border-border/40 focus:border-primary/50 focus:outline-none transition-all text-sm font-medium resize-none"
                      placeholder="Describe your industry, target audience, and current challenges..."
                      value={contextFormData.domainContext}
                      onChange={(e) =>
                        setContextFormData({ ...contextFormData, domainContext: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                      User Context
                    </label>
                    <textarea
                      className="w-full min-h-[70px] p-4 rounded-2xl bg-accent/5 border border-border/40 focus:border-primary/50 focus:outline-none transition-all text-sm font-medium resize-none"
                      placeholder="What specifically should the agents focus on for this run?"
                      value={contextFormData.userContext}
                      onChange={(e) =>
                        setContextFormData({ ...contextFormData, userContext: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">
                      Institutional Memory
                    </label>
                    <textarea
                      className="w-full min-h-[60px] p-4 rounded-2xl bg-accent/5 border border-border/40 focus:border-primary/50 focus:outline-none transition-all text-sm font-medium resize-none"
                      placeholder="Past campaigns, brand guidelines, key context to remember..."
                      value={contextFormData.institutionalMemory}
                      onChange={(e) =>
                        setContextFormData({
                          ...contextFormData,
                          institutionalMemory: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {/* Cost preview */}
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl border ${
                    isInsufficientBalance
                      ? "bg-destructive/5 border-destructive/30"
                      : "bg-accent/5 border-border/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isSimulation ? (
                      <PieChart className="h-4 w-4 text-primary" />
                    ) : (
                      <Wallet className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      Cost
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-foreground">
                      {currentCost}{" "}
                      {isSimulation ? "Learning Credits" : "Production Tokens"}
                    </div>
                    <div
                      className={`text-[10px] font-bold ${
                        isInsufficientBalance ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {isInsufficientBalance
                        ? "Insufficient balance"
                        : `${currentBalance - currentCost} remaining after`}
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex flex-col gap-3 pt-1">
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      submitting || !contextFormData.domainContext || isInsufficientBalance
                    }
                    className="w-full h-14 rounded-2xl font-black uppercase tracking-[0.2em] text-sm gap-2 shadow-xl shadow-primary/20"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        Initiate Manufacturing Swarm{" "}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground font-medium italic">
                    This action will deduct{" "}
                    {isSimulation ? "learning credits" : "production tokens"} and
                    trigger the Context AI Factory.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

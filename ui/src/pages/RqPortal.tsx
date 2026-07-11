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
  Loader2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { amxApi } from "@/api/amx";
import { agentsApi } from "@/api/agents";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { DeliverablesBriefcase } from "@/components/DeliverablesBriefcase";

const TIERS = [
  {
    id: 1,
    slug: "digital_foundation",
    name: "Digital Foundation",
    price: "$1,000",
    creditCost: 100000,
    description: "Essential Digital Presence. Perfect for solopreneurs and startups looking to establish their digital presence with AI-powered automation.",
    features: [
      "Context Setup & Brand Voice Definition",
      "Social Media Automation (3x/week)",
      "4 AI-Generated Blog Posts/Month",
      "LinkedIn/Twitter Agent Deployment",
      "Certificate of Services (Basic Auth)",
      "Online Dashboard Access"
    ],
    deliverables: ["Social Content", "Blog Posts", "Certificate"],
    deployment: "Online",
    color: "primary"
  },
  {
    id: 2,
    slug: "hybrid_growth",
    name: "Hybrid Growth",
    price: "$2,000",
    creditCost: 200000,
    description: "Growth & Physical Presence. For growing SMBs ready to scale with web development, print materials, and video content.",
    features: [
      "Everything in Tier 1",
      "Context-Aware Landing Page + Chatbot",
      "Print-Ready Marketing Materials",
      "Business Cards & Banner Designs",
      "AI-Generated Video Scripts & Avatars",
      "Verified Smart Certificate",
      "Physical + Online Deployment"
    ],
    deliverables: ["Social", "Web", "Print", "Video", "Certificate"],
    deployment: "Online + Physical",
    color: "emerald-500",
    popular: true
  },
  {
    id: 3,
    slug: "metaverse_enterprise",
    name: "Metaverse Enterprise",
    price: "$3,000",
    creditCost: 300000,
    description: "Full Scale Domination. Forward-thinking brands ready for XR, digital twins, and metaverse presence.",
    features: [
      "Everything in Tier 2",
      "Custom Virtual Booth on xrexpo.space",
      "3D Product Models (Metaverse-Ready)",
      "Geospatial Digital Twin",
      "Microsoft Teams Integration (TeamsFx)",
      "AR Features for In-Person Events",
      "Gold Standard Certification + NFT Mint",
      "All Deployment Modes"
    ],
    deliverables: ["Social", "Web", "Print", "Video", "3D Models", "Digital Twin", "Certificate"],
    deployment: "Online + Physical + Metaverse",
    color: "amber-500"
  }
];

const ROLE_ICONS: Record<string, React.ElementType> = {
  ceo: Zap, cto: Cpu, cmo: Sparkles, cfo: PieChart, engineer: Layers,
  designer: Globe, pm: Workflow, qa: ShieldCheck, devops: Package,
  researcher: Dna, auditor: UserCheck, general: Activity,
};

export function RqPortal() {
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [activeTier, setActiveTier] = React.useState<any>(null);
  const [isSimulation, setIsSimulation] = React.useState(true);
  const [contextFormData, setContextFormData] = React.useState({
    userContext: "",
    domainContext: "",
    institutionalMemory: ""
  });

  const walletQuery = useQuery({
    queryKey: ["amx-wallet", selectedCompanyId],
    queryFn: () => amxApi.getWallet(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const wallet = {
    credits: walletQuery.data?.creditBalance ?? 0,
    tokens: walletQuery.data?.tokenBalance ?? 0,
  };

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const catalogQuery = useQuery({
    queryKey: ["amx-rq-catalog", selectedCompanyId],
    queryFn: () => amxApi.getRqCatalog(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const microServices = catalogQuery.data?.microServices ?? [];

  const scrollToTiers = () => document.getElementById("tiers")?.scrollIntoView({ behavior: "smooth" });

  const handleBuyCredits = async () => {
    if (!selectedCompanyId) return;
    try {
      const { checkoutUrl } = await amxApi.buyCredits(selectedCompanyId, "default", "self");
      window.location.href = checkoutUrl;
    } catch {
      pushToast({ tone: "warn", title: "Credit purchase unavailable" });
    }
  };

  const handleOpenModal = (tier: any) => {
    setActiveTier(tier);
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedCompanyId || !activeTier) return;
    setSubmitting(true);
    try {
      await amxApi.submitRq(selectedCompanyId, {
        // Micro-services submit by serviceKey; big tiers submit by tier slug.
        ...(activeTier.isMicroService ? { serviceKey: activeTier.serviceKey } : { tier: activeTier.slug }),
        contextData: contextFormData,
        isSimulation,
        deploymentMode: activeTier.deployment.toLowerCase().includes("physical") ? "hybrid" : "cloud"
      });
      setIsModalOpen(false);
      pushToast({
        tone: "success",
        title: "RQ Submitted Successfully!",
        body: `Your ${activeTier.name} request has been received by the Context AI Factory.`
      });
      setContextFormData({ userContext: "", domainContext: "", institutionalMemory: "" });
    } catch (err) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 402) {
        // Live runs charge credits — surface the shortfall and route to purchase.
        pushToast({
          tone: "warn",
          title: "Not enough credits",
          body: apiErr.message ?? "This live run costs more credits than your balance. Buy a credit block to continue.",
        });
      } else {
        pushToast({
          tone: "error",
          title: "Submission Failed",
          body: "There was an error processing your RQ. Please try again."
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { id: 'pre', label: 'Pre-Production', active: true },
    { id: 'sim', label: 'Simulation', active: isSimulation },
    { id: 'prod', label: 'Production', active: !isSimulation },
    { id: 'live', label: 'Live Performance', active: !isSimulation },
    { id: 'post', label: 'Post-Production', active: true }
  ];

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

            {/* Simulation Wallet Dashboard */}
            <div className="flex items-center gap-4 bg-card/80 backdrop-blur-md p-4 rounded-3xl border border-border/60 shadow-xl">
              <div className="flex flex-col px-4 border-r border-border/40">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                  <PieChart className="h-3 w-3 text-primary" /> Learning Credits
                </span>
                <span className="text-2xl font-black text-foreground">{wallet.credits.toLocaleString()}</span>
              </div>
              <div className="flex flex-col px-4">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
                  <Wallet className="h-3 w-3 text-amber-500" /> Prod Tokens
                </span>
                <span className="text-2xl font-black text-foreground">{wallet.tokens.toLocaleString()}</span>
              </div>
              <Button size="sm" variant="outline" onClick={handleBuyCredits} className="rounded-2xl border-primary/20 bg-primary/5 hover:bg-primary/10 font-bold text-[10px] uppercase tracking-widest px-4 h-10">
                Buy Credit Block
              </Button>
            </div>
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-foreground mb-6 leading-tight max-w-4xl">
            Context AI Factory: <span className="text-primary block md:inline">AI Speed + Human Touch</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground font-medium max-w-3xl leading-relaxed">
            Submit your Requirement (RQ) and let our Context AI Factory manufacture intelligence tailored to your business. 
            From social media to metaverse presence, we deliver agency-grade services at a fraction of the cost.
          </p>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-8 md:mt-12">
            <Button size="lg" onClick={scrollToTiers} className="h-14 px-8 gap-3 font-black text-[13px] uppercase tracking-[0.2em] shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
              Submit Your RQ
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Button>
            <Button variant="outline" size="lg" onClick={scrollToTiers} className="h-14 px-8 gap-3 font-black text-[13px] uppercase tracking-[0.2em] border-border/60">
              Explore Service Tiers
              <History className="h-5 w-5 shrink-0" />
            </Button>
          </div>
        </div>
      </section>

      {/* Tiers Section */}
      <section id="tiers" className="px-4 md:px-8 py-12 md:py-20 bg-background">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center text-center mb-10 md:mb-16">
            <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">Service Tiers</h2>
            <h3 className="text-3xl md:text-4xl font-black text-foreground">Choose Your Manufacturing Level</h3>
            <div className="w-12 h-1 bg-primary rounded-full mt-6" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {TIERS.map((tier) => (
              <div 
                key={tier.id}
                className={`group relative flex flex-col rounded-2xl border ${tier.popular ? "border-primary shadow-[0_0_40px_rgba(var(--primary-rgb),0.1)] scale-105" : "border-border/60"} bg-card hover:border-primary/40 transition-all duration-300 p-8`}
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
                  <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                    or {tier.creditCost.toLocaleString()} credits · live run
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-4 leading-relaxed font-medium">
                    {tier.description}
                  </p>
                </div>

                <div className="flex-1 space-y-4 mb-8">
                  <div className="flex flex-col gap-3">
                    {tier.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-[13px] font-medium text-foreground/80">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">Deliverables</span>
                    <div className="flex flex-wrap gap-2">
                      {tier.deliverables.map(item => (
                        <span key={item} className="px-2.5 py-1 rounded-full bg-accent/40 text-[10px] font-bold text-foreground/80 border border-border/40">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">Deployment</span>
                    <div className="flex items-center gap-2 text-[12px] font-bold text-foreground">
                      <Globe className="h-3.5 w-3.5 text-primary" />
                      {tier.deployment}
                    </div>
                  </div>

                  <Button 
                    onClick={() => handleOpenModal(tier)}
                    disabled={submitting}
                    className={`w-full h-12 font-black text-[12px] uppercase tracking-[0.2em] ${tier.popular ? "shadow-lg shadow-primary/20" : "variant-secondary"}`}
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
 
          {/* On-Demand Micro Services */}
          <div className="mt-20 border-t border-border/40 pt-20">
            <div className="flex flex-col items-center text-center mb-10 md:mb-16">
              <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">On-Demand Micro Services</h2>
              <h3 className="text-3xl md:text-4xl font-black text-foreground">Single Deliverables, Priced in Credits</h3>
              <p className="text-base md:text-lg text-muted-foreground font-medium max-w-2xl leading-relaxed mt-4">
                Competitive one-off services for nonprofits, businesses, and personal brands — no full tier required.
              </p>
              <div className="w-12 h-1 bg-primary rounded-full mt-6" />
            </div>

            {catalogQuery.isLoading && (
              <div className="flex items-center justify-center gap-3 p-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading service menu...</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {microServices.map((service) => (
                <div
                  key={service.key}
                  className="group relative flex flex-col rounded-2xl border border-border/60 bg-card hover:border-primary/40 transition-all duration-300 p-6"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h4 className="text-lg font-black text-foreground group-hover:text-primary transition-colors leading-tight">
                      {service.label}
                    </h4>
                    {service.segment === "nonprofit" && (
                      <span className="shrink-0 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[9px] font-black uppercase tracking-widest">
                        Nonprofit
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground font-medium leading-relaxed flex-1">
                    {service.description}
                  </p>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-4">
                    {service.creditCost.toLocaleString()} credits
                  </div>
                  <Button
                    onClick={() => handleOpenModal({
                      serviceKey: service.key,
                      name: service.label,
                      creditCost: service.creditCost,
                      isMicroService: true,
                      deployment: "Online",
                    })}
                    disabled={submitting}
                    variant="outline"
                    className="w-full h-11 mt-4 font-black text-[11px] uppercase tracking-[0.2em] border-border/60"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-20 border-t border-border/40 pt-20">
             <div className="flex flex-col items-center text-center mb-12">
                <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">Manufactured Intelligence</h2>
                <h3 className="text-3xl md:text-5xl font-black text-foreground mb-6">Briefcase: Live Factory Deliverables</h3>
                <p className="text-base md:text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
                   Track every deliverable manufactured by your Context AI Swarm. Complete measurement and direct access to your digital assets.
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
              <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">The Agentic Workforce</h2>
              <h3 className="text-3xl md:text-5xl font-black text-foreground mb-6 md:mb-8">Powered by the AMX Agent Swarm</h3>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed font-medium mb-8 md:mb-10 max-w-xl">
                Our specialized AI agents work in parallel to manufacture your intelligence at industrial scales. 
                Each agent is tuned for specific roles in the context continuum.
              </p>
              
              <div className="flex flex-col gap-6">
                {(agentsQuery.data ?? []).slice(0, 8).map((agent) => {
                  const Icon = ROLE_ICONS[agent.role] ?? Activity;
                  return (
                    <div key={agent.id} className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-card/50 hover:border-primary/30 hover:bg-card transition-all group">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-all duration-300">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-[14px] font-black text-foreground">{agent.name}</h4>
                        <p className="text-[12px] text-muted-foreground font-medium">{agent.role} · {agent.adapterType}</p>
                      </div>
                    </div>
                  );
                })}
                {agentsQuery.isLoading && (
                  <div className="flex items-center gap-3 p-4 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Loading agents...</span>
                  </div>
                )}
                {!agentsQuery.isLoading && (agentsQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground p-4">No agents deployed yet. Create your first agent to start manufacturing.</p>
                )}
              </div>
            </div>

            <div className="relative aspect-square w-full max-w-sm mx-auto lg:max-w-none mt-10 lg:mt-0">
              {/* Futuristic Visualizer Representation */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-full border border-primary/20 rounded-full animate-[spin_20s_linear_infinite]" />
                <div className="absolute w-[80%] h-[80%] border border-primary/40 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                <div className="absolute w-[60%] h-[60%] border border-primary/60 rounded-full animate-[spin_10s_linear_infinite]" />
                
                <div className="absolute p-10 bg-background rounded-full border-2 border-primary shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)] animate-pulse">
                  <Factory className="h-12 w-12 text-primary" />
                </div>
                
                {/* Orbital Icon Slots */}
                {[0, 72, 144, 216, 288].map((degree, idx) => {
                  const agent = (agentsQuery.data ?? [])[idx];
                  const Icon = agent ? (ROLE_ICONS[agent.role] ?? Activity) : Cpu;
                  return (
                    <div
                      key={idx}
                      className="absolute"
                      style={{ transform: `rotate(${degree}deg) translateY(-40%)` }}
                    >
                      <div className="w-14 h-14 bg-card border border-primary/40 rounded-xl flex items-center justify-center text-primary shadow-lg animate-bounce" style={{ animationDelay: `${idx * 0.2}s` }}>
                        <Icon className="h-6 w-6" />
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Context Indicators */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-full max-w-sm p-6 rounded-2xl bg-card border border-border shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  <span className="text-[12px] font-black uppercase tracking-widest">Active Manufacturing: Tier 3</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground">User Context</span>
                    <div className="w-24 h-1.5 bg-accent rounded-full overflow-hidden">
                      <div className="w-[85%] h-full bg-emerald-500" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground">Domain Context</span>
                    <div className="w-24 h-1.5 bg-accent rounded-full overflow-hidden">
                      <div className="w-[92%] h-full bg-emerald-500" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground">Inst. Memory</span>
                    <div className="w-24 h-1.5 bg-accent rounded-full overflow-hidden">
                      <div className="w-[78%] h-full bg-emerald-500" />
                    </div>
                  </div>
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
            <h2 className="text-[13px] font-black tracking-[0.3em] uppercase text-primary mb-3">How It Works</h2>
            <h3 className="text-3xl md:text-4xl font-black text-foreground">Four Simple Steps from Requirement to Delivery</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-4 w-full">
            {[
              { step: "1", title: "Submit Your RQ", desc: "Tell us your requirements, upload brand assets, and choose your deployment mode.", icon: Send },
              { step: "2", title: "AI Agents Activate", desc: "Our AI agent swarm begins processing your request through high-context workflows.", icon: Workflow },
              { step: "3", title: "Review & Refine", desc: "Track real-time progress. Review deliverables and request adjustments.", icon: LayoutDashboard },
              { step: "4", title: "Deploy & Certify", desc: "Receive deliverables across all modes and get a blockchain-verified PoW Certificate.", icon: ShieldCheck },
            ].map((s, idx) => (
              <div key={idx} className="relative p-8 rounded-2xl border border-border/40 bg-accent/5 hover:border-primary/40 transition-all text-center group">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-[12px] font-black text-primary">
                  {s.step}
                </div>
                <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <s.icon className="h-6 w-6" />
                </div>
                <h4 className="text-[14px] font-black text-foreground mb-2 uppercase tracking-wide">{s.title}</h4>
                <p className="text-[12px] text-muted-foreground font-medium leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          <Button size="lg" onClick={scrollToTiers} className="w-full sm:w-auto h-14 md:h-16 px-6 md:px-12 mt-12 md:mt-20 gap-3 font-black text-[12px] md:text-[15px] uppercase tracking-[0.2em] md:tracking-[0.3em] shadow-2xl shadow-primary/40 transition-all hover:scale-105 active:scale-95 whitespace-normal sm:whitespace-nowrap flex-wrap h-auto py-4">
            Ready to Transform Your Business?
            <Zap className="h-5 w-5 md:h-6 md:w-6 shrink-0" />
          </Button>
        </div>
      </section>
      {isModalOpen && activeTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-lg bg-card border border-border/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-border/40 flex items-center justify-between bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Context Intake</h3>
                  <p className="text-[11px] font-bold text-primary uppercase tracking-widest">{activeTier.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-accent rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              {/* Simulation Mode Toggle */}
              <div className="p-4 rounded-2xl bg-accent/5 border border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg transition-colors ${isSimulation ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                    {isSimulation ? <Sparkles className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">Deployment Mode</span>
                    <span className="text-sm font-black text-foreground">{isSimulation ? "Simulation (Free)" : "Live Production (Charges Credits)"}</span>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant={isSimulation ? "outline" : "default"}
                  className={`h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest ${isSimulation ? "border-emerald-500/30 text-emerald-500" : "bg-amber-500 text-white shadow-lg shadow-amber-500/20"}`}
                  onClick={() => setIsSimulation(!isSimulation)}
                >
                  {isSimulation ? "Switch to Live" : "Switch to Sim"}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Domain Context</label>
                  <textarea 
                    className="w-full min-h-[100px] p-4 rounded-2xl bg-accent/5 border border-border/40 focus:border-primary/50 focus:ring-0 transition-all text-sm font-medium resize-none"
                    placeholder="Describe your industry, target audience, and current challenges..."
                    value={contextFormData.domainContext}
                    onChange={(e) => setContextFormData({ ...contextFormData, domainContext: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">User Context</label>
                  <textarea 
                    className="w-full min-h-[80px] p-4 rounded-2xl bg-accent/5 border border-border/40 focus:border-primary/50 focus:ring-0 transition-all text-sm font-medium resize-none"
                    placeholder="What specifically should the agents focus on for this run?"
                    value={contextFormData.userContext}
                    onChange={(e) => setContextFormData({ ...contextFormData, userContext: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <Button 
                  onClick={handleSubmit} 
                  disabled={submitting || !contextFormData.domainContext}
                  className="w-full h-14 rounded-2xl font-black uppercase tracking-[0.2em] text-sm gap-2 shadow-xl shadow-primary/20"
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Initiate Manufacturing Swarm <ArrowRight className="h-4 w-4" /></>}
                </Button>
                <p className="text-[10px] text-center text-muted-foreground font-medium italic">
                  {isSimulation
                    ? "Simulation runs are free — no credits are charged."
                    : `Live run charges ${activeTier.creditCost.toLocaleString()} credits from your wallet (balance: ${wallet.credits.toLocaleString()}).`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

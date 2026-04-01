import React, { useState } from "react";
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
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { amxApi } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";

const TIERS = [
  {
    id: 1,
    slug: "starter",
    name: "Digital Foundation",
    price: "$1,000",
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
    slug: "pro",
    name: "Hybrid Growth",
    price: "$2,000",
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
    slug: "enterprise",
    name: "Metaverse Enterprise",
    price: "$3,000",
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

const AGENTS = [
  { name: "Strategy Agent", role: "GPT-4 powered planning & copy", icon: Cpu },
  { name: "Visual Agent", role: "Fal.ai image generation", icon: Sparkles },
  { name: "Spatial Agent", role: "Hunyuan3D for 3D models", icon: Globe },
  { name: "Document Agent", role: "PDF generation & formatting", icon: Package },
  { name: "Content Agent", role: "Copywriting & SEO optimization", icon: Dna }
];

export function RqPortal() {
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (tierSlug: string) => {
    if (!selectedCompanyId) return;
    setSubmitting(true);
    try {
      await amxApi.submitRq(selectedCompanyId, {
        tier: tierSlug,
        contextData: {
          userContext: "Default User Context",
          domainContext: "Default Domain Context",
          institutionalMemory: "Initial Memory Seed"
        },
        deploymentMode: "hybrid"
      });
      pushToast({
        tone: "success",
        title: "RQ Submitted Successfully!",
        body: `Your ${tierSlug} request has been received by the Context AI Factory.`
      });
    } catch (err) {
      pushToast({
        tone: "error",
        title: "Submission Failed",
        body: "There was an error processing your RQ. Please try again."
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
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Factory className="h-8 w-8" />
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight text-foreground uppercase">
              AMX RQ PORTAL
            </h1>
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-foreground mb-6 leading-tight max-w-4xl">
            Context AI Factory: <span className="text-primary block md:inline">AI Speed + Human Touch</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground font-medium max-w-3xl leading-relaxed">
            Submit your Requirement (RQ) and let our Context AI Factory manufacture intelligence tailored to your business. 
            From social media to metaverse presence, we deliver agency-grade services at a fraction of the cost.
          </p>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-8 md:mt-12">
            <Button size="lg" className="h-14 px-8 gap-3 font-black text-[13px] uppercase tracking-[0.2em] shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
              Submit Your RQ
              <ArrowRight className="h-5 w-5 shrink-0" />
            </Button>
            <Button variant="outline" size="lg" className="h-14 px-8 gap-3 font-black text-[13px] uppercase tracking-[0.2em] border-border/60">
              Explore Service Tiers
              <History className="h-5 w-5 shrink-0" />
            </Button>
          </div>
        </div>
      </section>

      {/* Tiers Section */}
      <section className="px-4 md:px-8 py-12 md:py-20 bg-background">
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
                    onClick={() => handleSubmit(tier.slug)}
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
                {AGENTS.map((agent) => (
                  <div key={agent.name} className="flex items-center gap-4 p-4 rounded-xl border border-border/40 bg-card/50 hover:border-primary/30 hover:bg-card transition-all group">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-all duration-300">
                      <agent.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-black text-foreground">{agent.name}</h4>
                      <p className="text-[12px] text-muted-foreground font-medium">{agent.role}</p>
                    </div>
                  </div>
                ))}
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
                {[0, 72, 144, 216, 288].map((degree, idx) => (
                  <div 
                    key={idx}
                    className="absolute"
                    style={{ transform: `rotate(${degree}deg) translateY(-40%)` }}
                  >
                    <div className="w-14 h-14 bg-card border border-primary/40 rounded-xl flex items-center justify-center text-primary shadow-lg animate-bounce" style={{ animationDelay: `${idx * 0.2}s` }}>
                      {React.createElement(AGENTS[idx].icon, { className: "h-6 w-6" })}
                    </div>
                  </div>
                ))}
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

          <Button size="lg" className="w-full sm:w-auto h-14 md:h-16 px-6 md:px-12 mt-12 md:mt-20 gap-3 font-black text-[12px] md:text-[15px] uppercase tracking-[0.2em] md:tracking-[0.3em] shadow-2xl shadow-primary/40 transition-all hover:scale-105 active:scale-95 whitespace-normal sm:whitespace-nowrap flex-wrap h-auto py-4">
            Ready to Transform Your Business?
            <Zap className="h-5 w-5 md:h-6 md:w-6 shrink-0" />
          </Button>
        </div>
      </section>
    </div>
  );
}

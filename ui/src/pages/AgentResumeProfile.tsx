import React, { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "@/lib/router";
import {
  Star,
  Zap,
  Briefcase,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ArrowLeft,
  FileText,
  Activity,
  Award,
  Wallet,
  Loader2,
  Search,
  TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import { amxApi, type Earner, type PrincipalWalletData, type MemberPortfolioItem, type AgentPortfolioItem } from "@/api/amx";
import { lmsApi, type PhaseEarningsGroup } from "@/api/lms";

// Human-readable names for the MARKETPLACE_PHASE_MULTIPLIERS keys
// (@paperclipai/shared) — that constant is the canonical source of which
// phases exist; this page just needs display labels for them.
const PHASE_LABELS: Record<string, string> = {
  simulation: "Simulation",
  pre_production: "Pre-Production",
  production: "Production",
  live: "Live",
  post_production: "Post-Production",
};
function phaseLabel(phase: string | null): string {
  if (!phase) return "Unspecified";
  return PHASE_LABELS[phase] ?? phase;
}

function dicebearUrl(seed: string) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

// Unified shape the page renders from — the marketplaceAgentId route param
// may resolve to either a real roster Agent or a marketplace listing (human
// expert / co-op pair / team). See the resolution effect below for how the
// two are told apart.
interface ResolvedProfile {
  kind: "agent" | "listing";
  id: string;
  memberId: string;
  listingId: string | null;
  name: string;
  title: string;
  description: string;
  skills: string[];
  badges: string[];
  avatarUrl: string;
  hourlyRateTokens: number;
  rating: number | null;
  reviews: number | null;
  available: boolean;
}

export function AgentResumeProfile() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { marketplaceAgentId } = useParams<{ marketplaceAgentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hired, setHired] = useState(false);

  // 1) Try resolving the id as a real roster agent first.
  const agentQuery = useQuery({
    queryKey: ["agent-profile", "agent", selectedCompanyId, marketplaceAgentId],
    queryFn: () => agentsApi.get(marketplaceAgentId!, selectedCompanyId ?? undefined),
    enabled: !!selectedCompanyId && !!marketplaceAgentId,
    retry: false,
  });

  // 2) Fall back to the marketplace listing (human / co-op / team, or an
  // agent whose listing id doesn't match its roster agent id) when the
  // agent lookup misses — this is the common case, since TalentCard links
  // every tab to the listing id, not the underlying principal id.
  const exchangeQuery = useQuery({
    queryKey: ["agent-profile", "exchange", selectedCompanyId],
    queryFn: () => amxApi.getExchange(selectedCompanyId!),
    enabled: !!selectedCompanyId && agentQuery.isError,
  });
  const listing: Earner | undefined = useMemo(
    () => exchangeQuery.data?.earners.find((e) => e.id === marketplaceAgentId),
    [exchangeQuery.data, marketplaceAgentId],
  );

  const profile: ResolvedProfile | null = useMemo(() => {
    if (agentQuery.data) {
      const a = agentQuery.data;
      return {
        kind: "agent",
        id: marketplaceAgentId!,
        memberId: a.id,
        listingId: null,
        name: a.name,
        title: a.title ?? a.role,
        description: a.capabilities ?? "No description on file for this agent yet.",
        skills: a.capabilities ? a.capabilities.split(",").map((s) => s.trim()).filter(Boolean) : [],
        badges: [a.status === "running" ? "Active" : a.status === "pending_approval" ? "Pending Approval" : "AMX Verified"],
        avatarUrl: dicebearUrl(a.id),
        hourlyRateTokens: 0,
        rating: null,
        reviews: null,
        available: a.status === "running" || a.status === "idle",
      };
    }
    if (listing) {
      return {
        kind: "listing",
        id: marketplaceAgentId!,
        memberId: listing.memberId,
        listingId: listing.id,
        name: listing.name,
        title: listing.title,
        description: listing.bio || "No bio on file yet.",
        skills: listing.skills,
        badges: ["AMX Verified"],
        avatarUrl: dicebearUrl(listing.id),
        hourlyRateTokens: listing.rate,
        rating: listing.rating,
        reviews: listing.reviews,
        available: listing.status === "Available Now",
      };
    }
    return null;
  }, [agentQuery.data, listing, marketplaceAgentId]);

  const loading = agentQuery.isLoading || (agentQuery.isError && exchangeQuery.isLoading);
  const notFound = agentQuery.isError && exchangeQuery.isFetched && !listing;

  // Wallet — agent-backed profiles read the agent-wallet route, listing-backed
  // profiles (human / co-op / team) read the member-wallet route added for
  // this page.
  const walletQuery = useQuery({
    queryKey: ["agent-profile", "wallet", selectedCompanyId, profile?.kind, profile?.memberId],
    queryFn: () => profile!.kind === "agent"
      ? amxApi.getAgentWallet(selectedCompanyId!, profile!.memberId)
      : amxApi.getMemberWallet(selectedCompanyId!, profile!.memberId),
    enabled: !!selectedCompanyId && !!profile?.memberId,
  });
  const wallet: PrincipalWalletData = walletQuery.data ?? { creditBalance: 0, tokenBalance: 0, transactions: [] };

  // Phase-earnings breakdown — only meaningful for listing-backed profiles;
  // an agent resolved directly by roster id has no marketplace listing to
  // group completed bookings by.
  const phaseEarningsQuery = useQuery({
    queryKey: ["agent-profile", "phase-earnings", selectedCompanyId, profile?.listingId],
    queryFn: () => lmsApi.getEarningsByPhase(selectedCompanyId!, profile!.listingId!),
    enabled: !!selectedCompanyId && !!profile?.listingId,
    retry: false,
  });
  const phaseEarnings: PhaseEarningsGroup[] = phaseEarningsQuery.data ?? [];
  const totalCompletedBookings = phaseEarnings.reduce((sum, g) => sum + g.bookingCount, 0);
  const totalEarningsSims = phaseEarnings.reduce((sum, g) => sum + g.totalSims, 0);
  const maxPhaseSims = Math.max(1, ...phaseEarnings.map((g) => g.totalSims));

  // Portfolio — auto-derived from completed marketplace bookings (listing-
  // backed profiles) or certified RQ Factory runs (agent-backed profiles).
  const memberPortfolioQuery = useQuery({
    queryKey: ["agent-profile", "portfolio", "member", selectedCompanyId, profile?.memberId],
    queryFn: () => amxApi.getMemberPortfolio(selectedCompanyId!, profile!.memberId),
    enabled: !!selectedCompanyId && !!profile?.memberId && profile?.kind === "listing",
  });
  const agentPortfolioQuery = useQuery({
    queryKey: ["agent-profile", "portfolio", "agent", selectedCompanyId, profile?.memberId],
    queryFn: () => amxApi.getAgentPortfolio(selectedCompanyId!, profile!.memberId),
    enabled: !!selectedCompanyId && !!profile?.memberId && profile?.kind === "agent",
  });
  const memberPortfolioItems: MemberPortfolioItem[] = memberPortfolioQuery.data?.items ?? [];
  const agentPortfolioItems: AgentPortfolioItem[] = agentPortfolioQuery.data?.items ?? [];

  const hireMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !profile) throw new Error("No company selected");
      return agentsApi.create(selectedCompanyId, {
        name: profile.name,
        role: profile.title,
        status: "in_training",
        icon: "monitor",
        metadata: {
          hiredFromMarketplace: true,
          marketplaceId: profile.id,
          skills: profile.skills,
        },
      });
    },
    onSuccess: (data) => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: ["agents", selectedCompanyId] });
      }
      setHired(true);
      setTimeout(() => {
        navigate(`/${selectedCompany?.issuePrefix}/agents/${data.id}/onboarding`);
      }, 1500);
    },
  });

  const handleHire = () => {
    hireMutation.mutate();
  };

  // Directory visibility toggle — only meaningful for a real roster agent
  // (profile.kind === "agent"); marketplace-listing-backed profiles have no
  // underlying agent row to patch.
  const isPublicProfile = agentQuery.data?.isPublicProfile ?? false;
  const togglePublicProfileMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!profile || profile.kind !== "agent") throw new Error("No agent to update");
      return agentsApi.update(profile.memberId, { isPublicProfile: next }, selectedCompanyId ?? undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-profile", "agent", selectedCompanyId, marketplaceAgentId] });
    },
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Loading profile…</p>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 text-center px-4">
        <Search className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-black text-foreground">Profile not found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">This listing isn't on the marketplace anymore, or the link is out of date.</p>
        <Link to={`/${selectedCompany?.issuePrefix}/marketplace`}>
          <Button variant="outline" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Marketplace</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background animate-in fade-in duration-500">
      {/* Top Breadcrumb Header */}
      <div className="px-4 py-4 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
           <Link to={`/${selectedCompany?.issuePrefix}/marketplace`} className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
             <ArrowLeft className="h-4 w-4" /> Back to Marketplace
           </Link>
           <div className="flex items-center gap-4">
             {profile.kind === "agent" && (
               <button
                 type="button"
                 role="switch"
                 aria-checked={isPublicProfile}
                 disabled={togglePublicProfileMutation.isPending}
                 onClick={() => togglePublicProfileMutation.mutate(!isPublicProfile)}
                 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                 title="Public profile — visible in the cross-company directory"
               >
                 <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${isPublicProfile ? "bg-emerald-500" : "bg-muted-foreground/30"}`}>
                   <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isPublicProfile ? "translate-x-3.5" : "translate-x-0.5"}`} />
                 </span>
                 Public profile
               </button>
             )}
             <div className="flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${profile.available ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
               <span className={`text-[10px] font-black uppercase tracking-widest ${profile.available ? "text-emerald-500" : "text-amber-500"}`}>
                 {profile.available ? "Available for Hire" : "Currently Engaged"}
               </span>
             </div>
           </div>
        </div>
      </div>

      <main className="flex-1 py-10 px-4 md:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

           {/* Left Column: Profile Card & Actions */}
           <div className="lg:col-span-1 space-y-6">
             <div className="bg-card rounded-2xl border border-border/60 overflow-hidden shadow-lg shadow-primary/5">
                <div className="h-24 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent relative">
                   <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:12px_12px]" />
                </div>
                <div className="px-6 pb-6 relative">
                   <div className="-mt-12 mb-4 relative inline-block">
                     <img src={profile.avatarUrl} alt={profile.name} className="w-24 h-24 rounded-2xl object-cover ring-4 ring-card" />
                     <div className="absolute -bottom-2 -right-2 p-1.5 rounded-lg bg-card border border-border shadow-sm">
                       <ShieldCheck className="h-5 w-5 text-emerald-500" />
                     </div>
                   </div>

                   <h1 className="text-2xl font-black text-foreground">{profile.name}</h1>
                   <p className="text-sm font-medium text-muted-foreground mt-1">{profile.title}</p>

                   {profile.rating !== null && (
                     <div className="flex items-center gap-2 mt-4">
                       <Star className="h-4 w-4 fill-primary text-primary" />
                       <span className="font-bold">{profile.rating}</span>
                       <span className="text-muted-foreground">({profile.reviews ?? 0} verified runs)</span>
                     </div>
                   )}

                   <div className="flex flex-wrap gap-2 mt-4">
                     {profile.badges.map(badge => (
                        <span key={badge} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary border border-primary/20">
                          {badge === 'Active' || badge === 'AMX Verified' ? <Zap className="h-3 w-3" /> : <Award className="h-3 w-3" />}
                          {badge}
                        </span>
                     ))}
                   </div>
                </div>

                <div className="px-6 py-5 bg-accent/5 border-t border-border/40">
                  <div className="flex items-end justify-between mb-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Contract Rate</div>
                      <div className="text-2xl font-black text-foreground flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <span className="text-[11px] text-primary-foreground font-black">A</span>
                        </div>
                        {profile.hourlyRateTokens > 0 ? <>{profile.hourlyRateTokens} <span className="text-sm text-muted-foreground">/ hr</span></> : <span className="text-sm text-muted-foreground">Not listed</span>}
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full h-12 font-black text-[12px] uppercase tracking-widest gap-2"
                    onClick={handleHire}
                    disabled={hireMutation.isPending || hired}
                    variant={hired ? "secondary" : "default"}
                  >
                    {hireMutation.isPending ? (
                      <>Processing Transaction <Clock className="h-4 w-4 animate-spin" /></>
                    ) : hired ? (
                      <>Agent Hired <CheckCircle2 className="h-4 w-4" /></>
                    ) : (
                      <>Hire Agent with Tokens <Wallet className="h-4 w-4" /></>
                    )}
                  </Button>

                  {hired && (
                    <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center animate-in zoom-in duration-300">
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500 mb-1">Success</p>
                      <p className="text-xs text-muted-foreground">Proceeding to LMS Onboarding in Company AIR HUB.</p>
                      <Button variant="link" className="text-xs h-auto p-0 mt-2 text-primary font-bold">
                        Go to Dashboard →
                      </Button>
                    </div>
                  )}
                </div>
             </div>

             {/* Real Wallet + Ledger Stats */}
             <div className="bg-card rounded-2xl border border-border/60 p-6">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-6">
                  <Activity className="h-4 w-4" /> Verified Network Performance
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Completed Bookings</span>
                    <span className="text-sm font-black text-emerald-500">{totalCompletedBookings.toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm font-medium">Total Marketplace Earnings</span>
                    <span className="text-sm font-black text-primary">{totalEarningsSims.toLocaleString()} SIMS</span>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm font-medium">Total Ledger Runs</span>
                    <span className="text-sm font-black text-foreground">{wallet.transactions.length.toLocaleString()}</span>
                  </div>

                  <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-muted-foreground" /> Wallet Balance</span>
                    <span className="text-sm font-black text-foreground">{wallet.tokenBalance.toLocaleString()} <span className="text-muted-foreground font-medium">tokens</span></span>
                  </div>
                </div>
             </div>
           </div>

           {/* Right Column: Bio & Experience */}
           <div className="lg:col-span-2 space-y-8">

              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-1.5 rounded border border-border/60 bg-accent/5">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <h2 className="text-xl font-black text-foreground">About</h2>
                </div>
                <div className="p-6 md:p-8 rounded-2xl border border-border/50 bg-card shadow-sm text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {profile.description}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-1.5 rounded border border-border/60 bg-accent/5">
                    <Briefcase className="h-4 w-4 text-emerald-500" />
                  </div>
                  <h2 className="text-xl font-black text-foreground">Marketplace Earnings by Phase</h2>
                </div>

                {phaseEarnings.length > 0 ? (
                  <div className="space-y-3">
                    {phaseEarnings.map((group) => (
                      <div key={group.phase ?? "unspecified"} className="p-5 rounded-2xl border border-border/50 bg-card hover:border-border transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-black text-foreground">{phaseLabel(group.phase)}</h4>
                          <span className="text-sm font-black text-primary">{group.totalSims.toLocaleString()} SIMS</span>
                        </div>
                        <div className="w-full h-1.5 bg-accent/20 rounded-full overflow-hidden mb-2">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((group.totalSims / maxPhaseSims) * 100)}%` }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">{group.bookingCount.toLocaleString()} completed booking{group.bookingCount === 1 ? "" : "s"}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl border border-border/50 bg-card text-sm text-muted-foreground">
                    No completed marketplace bookings on record yet.
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-1.5 rounded border border-border/60 bg-accent/5">
                    <Zap className="h-4 w-4 text-amber-500" />
                  </div>
                  <h2 className="text-xl font-black text-foreground">Skills</h2>
                </div>
                <div className="p-6 rounded-2xl border border-border/50 bg-card">
                  {profile.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.map(skill => (
                         <div key={skill} className="px-4 py-2 rounded-lg bg-background border border-border shadow-sm text-sm font-bold text-foreground hover:border-primary/50 transition-colors cursor-default">
                           {skill}
                         </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No skills on file yet.</p>
                  )}
                </div>
              </section>

              {wallet.transactions.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-1.5 rounded border border-border/60 bg-accent/5">
                      <TrendingUp className="h-4 w-4 text-blue-400" />
                    </div>
                    <h2 className="text-xl font-black text-foreground">Recent Ledger Transactions</h2>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40 overflow-hidden">
                    {wallet.transactions.slice(0, 10).map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between px-5 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">{tx.transactionType.replace(/_/g, " ")}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(tx.occurredAt).toLocaleDateString()}</p>
                        </div>
                        <span className="font-black text-foreground shrink-0 ml-4">{tx.amount.toLocaleString()} {tx.currency}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

           </div>
        </div>

        {/* Portfolio — new bottom section, sibling of the grid above rather
            than interleaved with it. */}
        <div className="max-w-6xl mx-auto mt-8">
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-1.5 rounded border border-border/60 bg-accent/5">
                <Briefcase className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-xl font-black text-foreground">Portfolio</h2>
            </div>

            {profile.kind === "agent" ? (
              agentPortfolioItems.length > 0 ? (
                <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40 overflow-hidden">
                  {agentPortfolioItems.map((item) => (
                    <div key={item.submissionId} className="flex items-center justify-between px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">{item.tier.replace(/_/g, " ")} — RQ Factory</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(item.completedAt).toLocaleDateString()}</p>
                      </div>
                      <span className="font-black text-foreground shrink-0 ml-4">{item.creditCost.toLocaleString()} credits</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-2xl border border-border/50 bg-card text-sm text-muted-foreground">
                  No certified RQ Factory runs on record yet.
                </div>
              )
            ) : (
              memberPortfolioItems.length > 0 ? (
                <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40 overflow-hidden">
                  {memberPortfolioItems.map((item) => (
                    <div key={item.bookingId} className="flex items-center justify-between px-5 py-3 text-sm gap-4">
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">{item.projectTitle}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : "—"} · {phaseLabel(item.phase)} ·{" "}
                          <span className="uppercase tracking-widest font-black">{item.role}</span>
                        </p>
                      </div>
                      <span className="font-black text-foreground shrink-0">{item.budgetSims.toLocaleString()} SIMS</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-2xl border border-border/50 bg-card text-sm text-muted-foreground">
                  No completed engagements on record yet.
                </div>
              )
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

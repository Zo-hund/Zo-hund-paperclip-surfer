import React, { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Filter,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Zap,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { amxApi } from "@/api/amx";
import { marketplaceApi, type MarketplaceListing, type MarketplaceListingType } from "@/api/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarketplaceMicroserviceBooking, isMicroserviceListing } from "@/components/MarketplaceMicroserviceBooking";
import { useCompany } from "@/context/CompanyContext";

const DEFAULT_LISTING_FORM = {
  listingType: "agent" as MarketplaceListingType,
  name: "",
  title: "",
  description: "",
  skills: "",
  badges: "",
  hourlyRateTokens: "75",
  availability: "available",
  supportedRunPhases: "discover,deliver",
  payoutWallet: "",
  location: "",
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function XpExchange() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const [search, setSearch] = useState("");
  const [listingForm, setListingForm] = useState(DEFAULT_LISTING_FORM);
  const [reviewReason, setReviewReason] = useState("");
  const [bookingListing, setBookingListing] = useState<MarketplaceListing | null>(null);

  const exchangeQuery = useQuery({
    queryKey: ["amx", "exchange", selectedCompanyId],
    queryFn: () => amxApi.getExchange(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const profileQuery = useQuery({
    queryKey: ["marketplace", "me"],
    queryFn: () => marketplaceApi.getMyProfile(),
  });

  const adminQueueQuery = useQuery({
    queryKey: ["marketplace", "admin", "applications"],
    queryFn: () => marketplaceApi.listPartnerApplications(),
    enabled: !!profileQuery.data?.viewer.isInstanceAdmin,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["amx", "exchange", selectedCompanyId] }),
      queryClient.invalidateQueries({ queryKey: ["marketplace", "me"] }),
      queryClient.invalidateQueries({ queryKey: ["marketplace", "admin", "applications"] }),
      queryClient.invalidateQueries({ queryKey: ["amx", "lms", selectedCompanyId] }),
    ]);
  };

  const createListingMutation = useMutation({
    mutationFn: () =>
      marketplaceApi.createListing(selectedCompanyId!, {
        listingType: listingForm.listingType,
        name: listingForm.name,
        title: listingForm.title,
        description: listingForm.description,
        skills: splitCsv(listingForm.skills),
        badges: splitCsv(listingForm.badges),
        hourlyRateTokens: Number(listingForm.hourlyRateTokens),
        availability: listingForm.availability,
        supportedRunPhases: splitCsv(listingForm.supportedRunPhases),
        payoutWallet: listingForm.payoutWallet || null,
        location: listingForm.location || null,
      }),
    onSuccess: async () => {
      setListingForm(DEFAULT_LISTING_FORM);
      await refresh();
    },
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : "Failed to create listing");
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: (listingId: string) =>
      marketplaceApi.purchaseListing(selectedCompanyId!, listingId, { hours: 1, runPhase: "deliver" }),
    onSuccess: async (result) => {
      await refresh();
      window.alert(`Booked listing. ${result.totalCostTokens} AMX charged.`);
    },
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : "Failed to book listing");
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ userId, decision }: { userId: string; decision: "approve" | "reject" }) =>
      marketplaceApi.reviewPartnerApplication(userId, {
        decision,
        reviewReason: decision === "reject" ? reviewReason.trim() || "Profile needs more detail." : undefined,
      }),
    onSuccess: async () => {
      setReviewReason("");
      await refresh();
    },
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : "Failed to review application");
    },
  });

  if (exchangeQuery.isLoading || profileQuery.isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
      </div>
    );
  }

  if (exchangeQuery.error || profileQuery.error || !exchangeQuery.data || !profileQuery.data) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <p className="font-bold text-muted-foreground">Failed to load marketplace data</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  const profile = profileQuery.data.profile;
  const guidance = profileQuery.data.guidance;
  const stats = exchangeQuery.data.stats;
  const filteredListings = exchangeQuery.data.listings.filter((listing) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [
      listing.name,
      listing.title,
      listing.description,
      listing.provider.displayName,
      ...(listing.skills ?? []),
      ...(listing.badges ?? []),
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const sellerListings = filteredListings.filter((listing) => listing.providerUserId === profile.userId);

  const canSell = profile.partnerStatus === "active";
  const isPending = profile.partnerStatus === "pending";
  const adminQueue = adminQueueQuery.data ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background/50 animate-in fade-in duration-500">
      <MarketplaceMicroserviceBooking
        listing={bookingListing}
        open={!!bookingListing}
        onClose={() => setBookingListing(null)}
      />
      <section className="border-b border-border/40 bg-accent/5 px-8 py-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Store className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
              AMX Skills Marketplace
            </h1>
          </div>
          <p className="max-w-3xl text-xl font-medium leading-relaxed text-muted-foreground">
            Browse approved partner offerings for AI Agents, Co-op Pairs, and Full Teams. LMS credits
            stay in TECH AT NITE. Marketplace work pays AMX tokens only.
          </p>

          {!guidance.requiredChecklistComplete && (
            <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              TECH AT NITE onboarding is still required. {guidance.nextRecommendedStep} Visit `/lms/dashboard`
              before applying as a Partner or selling listings.
            </div>
          )}

          <div className="mt-10 grid gap-6 md:grid-cols-4">
            <div>
              <span className="text-2xl font-black text-primary">{stats.availableEarners}</span>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Active Listings</div>
            </div>
            <div>
              <span className="text-2xl font-black text-primary">{stats.projectsCompleted}</span>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Active Supply</div>
            </div>
            <div>
              <span className="text-2xl font-black text-primary">{profile.lmsCredits}</span>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">LMS Credits</div>
            </div>
            <div>
              <span className="text-2xl font-black text-primary">{profile.amxTokenBalance}</span>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">AMX Tokens</div>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-8 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by partner, skills, or offering type..."
              className="h-11 bg-accent/5 pl-10"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button variant="outline" className="h-11 gap-2 border-border/60 px-4">
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </Button>
        </div>
      </div>

      <main className="px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto grid max-w-7xl gap-8 xl:grid-cols-[1.4fr_0.8fr]">
          <section>
            <div className="mb-8 flex items-center justify-between gap-4">
              <h2 className="text-[13px] font-black uppercase tracking-[0.2em] text-muted-foreground/80">
                Showing {filteredListings.length} listings
              </h2>
              <div className="text-[12px] font-medium text-muted-foreground">
                Role: <span className="font-black uppercase text-primary">{profile.partnerStatus === "active" ? "Partner" : profile.roleIntent}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {filteredListings.map((listing) => (
                <div
                  key={listing.id}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-300 hover:border-primary/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
                >
                  <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-500">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    {listing.status}
                  </div>

                  <div className="p-6 pb-0">
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-accent text-xl font-black text-primary shadow-sm">
                        {listing.listingType === "team" ? <Users className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />}
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-foreground transition-colors group-hover:text-primary">
                          {listing.name}
                        </h3>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-primary/80">
                          <BadgeCheck className="h-3 w-3" />
                          {listing.title}
                        </p>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {listing.provider.displayName}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
                      {listing.description}
                    </p>
                  </div>

                  <div className="px-6 py-4">
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {listing.skills.map((skill) => (
                        <span key={skill} className="rounded bg-accent/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                          {skill}
                        </span>
                      ))}
                    </div>
                    <div className="mb-4 flex flex-wrap gap-1.5">
                      {listing.badges.map((badge) => (
                        <span key={badge} className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                          {badge}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-4 text-[11px]">
                      <div>
                        <div className="font-medium text-muted-foreground">Offering</div>
                        <div className="mt-1 font-black uppercase text-foreground">{listing.listingType}</div>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Availability</div>
                        <div className="mt-1 font-black uppercase text-foreground">{listing.availability ?? "available"}</div>
                      </div>
                    </div>
                    <div className="mt-4 border-t border-border/40 pt-4">
                      <div className="font-medium text-muted-foreground text-[11px]">Supported phases</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {listing.supportedRunPhases.map((phase) => (
                          <span key={phase} className="rounded bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground/70">
                            {phase}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-accent/5 px-6 py-4">
                    <div className="flex flex-col">
                      <div className="text-lg font-black text-primary">
                        {listing.hourlyRateTokens} AMX
                        <span className="ml-1 text-[10px] font-bold text-muted-foreground">/HR</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {listing.provider.location ?? listing.location ?? "Remote"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="h-9 gap-2 px-5 text-[11px] font-black uppercase tracking-widest"
                      onClick={() => {
                        if (isMicroserviceListing(listing)) {
                          setBookingListing(listing);
                          return;
                        }
                        purchaseMutation.mutate(listing.id);
                      }}
                      disabled={purchaseMutation.isPending}
                    >
                      {isMicroserviceListing(listing) ? "Book Microservice" : "Book Now"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-foreground">
                <ShieldCheck className={`h-4 w-4 ${canSell ? "text-emerald-500" : "text-amber-500"}`} />
                Seller Controls
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {canSell
                  ? "Your partner profile is active. Create v1 listings for AI Agents, Co-op Pairs, and Full Teams."
                  : isPending
                    ? "Your partner application is pending admin review. Listing creation is locked until approval."
                    : "Complete TECH AT NITE milestones and get approved before selling on the marketplace."}
              </p>

              <div className="mt-5 space-y-3 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Partner status</span>
                  <span className="font-black uppercase text-primary">{profile.partnerStatus}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Your listings</span>
                  <span className="font-black text-foreground">{sellerListings.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">AMX token balance</span>
                  <span className="font-black text-foreground">{profile.amxTokenBalance}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <h3 className="text-sm font-black uppercase tracking-[0.25em] text-foreground">Create Listing</h3>
              <div className="mt-5 space-y-4">
                <select
                  className="h-11 w-full rounded-md border border-border bg-transparent px-3 text-sm"
                  value={listingForm.listingType}
                  onChange={(event) => setListingForm((current) => ({ ...current, listingType: event.target.value as MarketplaceListingType }))}
                  disabled={!canSell}
                >
                  <option value="agent">AI Agent</option>
                  <option value="coop">Co-op Pair</option>
                  <option value="team">Full Team</option>
                </select>
                <Input
                  placeholder="Listing name"
                  value={listingForm.name}
                  onChange={(event) => setListingForm((current) => ({ ...current, name: event.target.value }))}
                  disabled={!canSell}
                />
                <Input
                  placeholder="Public title"
                  value={listingForm.title}
                  onChange={(event) => setListingForm((current) => ({ ...current, title: event.target.value }))}
                  disabled={!canSell}
                />
                <Textarea
                  placeholder="Describe the agent, co-op pair, or team."
                  rows={5}
                  value={listingForm.description}
                  onChange={(event) => setListingForm((current) => ({ ...current, description: event.target.value }))}
                  disabled={!canSell}
                />
                <Input
                  placeholder="Skills (comma separated)"
                  value={listingForm.skills}
                  onChange={(event) => setListingForm((current) => ({ ...current, skills: event.target.value }))}
                  disabled={!canSell}
                />
                <Input
                  placeholder="Badges / certifications"
                  value={listingForm.badges}
                  onChange={(event) => setListingForm((current) => ({ ...current, badges: event.target.value }))}
                  disabled={!canSell}
                />
                <Input
                  placeholder="Supported run phases"
                  value={listingForm.supportedRunPhases}
                  onChange={(event) => setListingForm((current) => ({ ...current, supportedRunPhases: event.target.value }))}
                  disabled={!canSell}
                />
                <Input
                  placeholder="Hourly AMX token rate"
                  value={listingForm.hourlyRateTokens}
                  onChange={(event) => setListingForm((current) => ({ ...current, hourlyRateTokens: event.target.value }))}
                  disabled={!canSell}
                />
                <Input
                  placeholder="Availability"
                  value={listingForm.availability}
                  onChange={(event) => setListingForm((current) => ({ ...current, availability: event.target.value }))}
                  disabled={!canSell}
                />
                <Input
                  placeholder="Location"
                  value={listingForm.location}
                  onChange={(event) => setListingForm((current) => ({ ...current, location: event.target.value }))}
                  disabled={!canSell}
                />
                <Input
                  placeholder="Payout wallet"
                  value={listingForm.payoutWallet}
                  onChange={(event) => setListingForm((current) => ({ ...current, payoutWallet: event.target.value }))}
                  disabled={!canSell}
                />
                <Button
                  className="w-full gap-2 text-[11px] font-black uppercase tracking-widest"
                  onClick={() => createListingMutation.mutate()}
                  disabled={
                    !canSell ||
                    createListingMutation.isPending ||
                    !listingForm.name.trim() ||
                    !listingForm.title.trim() ||
                    !listingForm.description.trim()
                  }
                >
                  <Zap className="h-4 w-4" />
                  {createListingMutation.isPending ? "Creating..." : "Publish Listing"}
                </Button>
              </div>
            </div>

            {profileQuery.data.viewer.isInstanceAdmin && (
              <div className="rounded-2xl border border-border/60 bg-card p-6">
                <h3 className="text-sm font-black uppercase tracking-[0.25em] text-foreground">Partner Review Queue</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Pending applicants are reviewed against LMS completion, certifications, and profile completeness.
                </p>

                <div className="mt-5 space-y-4">
                  <Textarea
                    placeholder="Optional rejection reason for the selected review."
                    rows={3}
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                  />

                  {adminQueueQuery.isLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading review queue...
                    </div>
                  )}

                  {adminQueue.map((application) => (
                    <div key={application.profile.userId} className="rounded-xl border border-border/50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-black text-foreground">{application.displayName}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                            {application.profile.userId}
                          </div>
                        </div>
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-500">
                          pending
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                        <div>
                          <div className="text-muted-foreground">Completed</div>
                          <div className="font-black text-foreground">{application.eligibility.completedEnrollments}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Certificates</div>
                          <div className="font-black text-foreground">{application.eligibility.totalCertificates}</div>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 text-[11px] font-black uppercase tracking-widest"
                          onClick={() => reviewMutation.mutate({ userId: application.profile.userId, decision: "approve" })}
                          disabled={reviewMutation.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-[11px] font-black uppercase tracking-widest"
                          onClick={() => reviewMutation.mutate({ userId: application.profile.userId, decision: "reject" })}
                          disabled={reviewMutation.isPending}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}

                  {!adminQueueQuery.isLoading && adminQueue.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                      No pending partner applications.
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

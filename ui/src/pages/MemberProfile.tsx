import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  Loader2,
  ShieldCheck,
  Sparkles,
  Store,
  Trophy,
  UserCheck,
  Wallet,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PublicLayout } from "@/components/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/lib/router";
import { marketplaceApi } from "@/api/marketplace";
import { ApiError } from "@/api/client";

export function MemberProfile() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    displayName: "",
    headline: "",
    bio: "",
    location: "",
    skills: "",
    badges: "",
    payoutWallet: "",
    availability: "",
    supportedRunPhases: "",
  });

  const profileQuery = useQuery({
    queryKey: ["marketplace", "me"],
    queryFn: () => marketplaceApi.getMyProfile(),
    retry: false,
  });

  useEffect(() => {
    const profile = profileQuery.data?.profile;
    if (!profile) return;
    setForm({
      displayName: profile.displayName ?? "",
      headline: profile.headline ?? "",
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      skills: (profile.skills ?? []).join(", "),
      badges: (profile.badges ?? []).join(", "),
      payoutWallet: profile.payoutWallet ?? "",
      availability: profile.availability ?? "",
      supportedRunPhases: (profile.supportedRunPhases ?? []).join(", "),
    });
  }, [profileQuery.data?.profile]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["marketplace", "me"] }),
      queryClient.invalidateQueries({ queryKey: ["marketplace", "admin", "applications"] }),
      queryClient.invalidateQueries({ queryKey: ["amx", "exchange"] }),
      queryClient.invalidateQueries({ queryKey: ["amx", "lms"] }),
    ]);
  };

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      marketplaceApi.updateProfile({
        displayName: form.displayName.trim() || null,
        headline: form.headline.trim() || null,
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        skills: form.skills.split(",").map((entry) => entry.trim()).filter(Boolean),
        badges: form.badges.split(",").map((entry) => entry.trim()).filter(Boolean),
        payoutWallet: form.payoutWallet.trim() || null,
        availability: form.availability.trim() || null,
        supportedRunPhases: form.supportedRunPhases.split(",").map((entry) => entry.trim()).filter(Boolean),
      }),
    onSuccess: refresh,
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : "Failed to update profile");
    },
  });

  const chooseRoleMutation = useMutation({
    mutationFn: (roleIntent: "member" | "partner") => marketplaceApi.updateProfile({ roleIntent }),
    onSuccess: refresh,
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : "Failed to update role");
    },
  });

  const partnerApplicationMutation = useMutation({
    mutationFn: () => marketplaceApi.submitPartnerApplication(),
    onSuccess: refresh,
    onError: (error) => {
      window.alert(error instanceof Error ? error.message : "Failed to submit partner application");
    },
  });

  const topUpCreditsMutation = useMutation({
    mutationFn: () => marketplaceApi.topUpBalance("lms", 250),
    onSuccess: refresh,
  });

  const topUpTokensMutation = useMutation({
    mutationFn: () => marketplaceApi.topUpBalance("tokens", 120),
    onSuccess: refresh,
  });

  if (profileQuery.isLoading) {
    return (
      <PublicLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        </div>
      </PublicLayout>
    );
  }

  if (profileQuery.error instanceof ApiError && profileQuery.error.status === 401) {
    return (
      <PublicLayout>
        <div className="mx-auto flex min-h-[75vh] max-w-4xl flex-col items-center justify-center px-6 text-center">
          <div className="rounded-full border border-primary/20 bg-primary/10 p-4 text-primary">
            <UserCheck className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-white">Member Central</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Choose a global AMX marketplace path as a Member or Partner. Members learn and browse.
            Partners unlock provider listings after LMS eligibility and admin approval.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth">
              <Button className="h-12 px-6 text-[11px] font-black uppercase tracking-widest">Sign In</Button>
            </Link>
            <Link to="/register">
              <Button variant="outline" className="h-12 px-6 text-[11px] font-black uppercase tracking-widest">Create Account</Button>
            </Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (profileQuery.error || !profileQuery.data) {
    return (
      <PublicLayout>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
          <p className="font-bold text-muted-foreground">Failed to load marketplace profile</p>
          <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
        </div>
      </PublicLayout>
    );
  }

  const { profile, eligibility, guidance } = profileQuery.data;
  const canApply =
    eligibility.eligibleForPartner &&
    guidance.requiredChecklistComplete &&
    profile.partnerStatus !== "active" &&
    profile.partnerStatus !== "pending";

  return (
    <PublicLayout>
      <div className="relative min-h-[90vh] px-4 py-12 md:px-8">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />

        <div className="relative z-10 mx-auto max-w-6xl space-y-10">
          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-border/60 bg-card/70 p-8">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-4xl font-black tracking-tighter text-white">Member Central</h1>
                  <p className="mt-1 text-sm uppercase tracking-[0.3em] text-muted-foreground">
                    Global Marketplace Identity
                  </p>
                </div>
              </div>

              <p className="mt-6 max-w-2xl leading-relaxed text-muted-foreground">
                This profile is separate from company membership and board access. Use it to choose whether
                you participate as a Member or apply to become a Partner provider in the AMX ecosystem.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                    <CreditCard className="h-4 w-4 text-amber-500" />
                    LMS Credits
                  </div>
                  <div className="mt-3 text-3xl font-black text-amber-500">{profile.lmsCredits}</div>
                  <Button
                    variant="outline"
                    className="mt-4 w-full text-[11px] font-black uppercase tracking-widest"
                    onClick={() => topUpCreditsMutation.mutate()}
                    disabled={topUpCreditsMutation.isPending}
                  >
                    Add 250 Credits
                  </Button>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/40 p-5">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                    <Wallet className="h-4 w-4 text-primary" />
                    AMX Tokens
                  </div>
                  <div className="mt-3 text-3xl font-black text-primary">{profile.amxTokenBalance}</div>
                  <Button
                    variant="outline"
                    className="mt-4 w-full text-[11px] font-black uppercase tracking-widest"
                    onClick={() => topUpTokensMutation.mutate()}
                    disabled={topUpTokensMutation.isPending}
                  >
                    Add 120 Tokens
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card/70 p-8">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                <Trophy className="h-4 w-4 text-primary" />
                TECH AT NITE Eligibility
              </div>
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed milestones</span>
                  <span className="font-black text-foreground">{eligibility.completedEnrollments}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Certificates</span>
                  <span className="font-black text-foreground">{eligibility.totalCertificates}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Hours trained</span>
                  <span className="font-black text-foreground">{eligibility.totalHoursTrained}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Partner eligibility</span>
                  <span className={`font-black uppercase ${eligibility.eligibleForPartner ? "text-emerald-400" : "text-amber-400"}`}>
                    {eligibility.eligibleForPartner ? "eligible" : "ineligible"}
                  </span>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-border/50 bg-background/30 p-4 text-sm leading-relaxed text-muted-foreground">
                Complete at least one required workshop or simulation bundle in TECH AT NITE before partner
                application becomes available.
              </div>
              <div className={`mt-4 rounded-2xl border p-4 text-sm leading-relaxed ${guidance.requiredChecklistComplete ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100" : "border-amber-500/20 bg-amber-500/10 text-amber-100"}`}>
                {guidance.requiredChecklistComplete
                  ? "Required LMS onboarding guidance is complete."
                  : guidance.nextRecommendedStep ?? "Complete the required TECH AT NITE onboarding guidance to unlock the Partner application."}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-border/60 bg-card/70 p-8">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                <UserCheck className="h-4 w-4 text-primary" />
                Choose Your Path
              </div>

              <div className="mt-6 grid gap-4">
                <div className={`rounded-2xl border p-5 ${profile.roleIntent === "member" ? "border-primary bg-primary/10" : "border-border/50 bg-background/30"}`}>
                  <h3 className="text-lg font-black text-white">Member</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Access the LMS, buy credits, track certifications, and browse the marketplace without provider tools.
                  </p>
                  <Button
                    className="mt-4 text-[11px] font-black uppercase tracking-widest"
                    variant={profile.roleIntent === "member" ? "default" : "outline"}
                    onClick={() => chooseRoleMutation.mutate("member")}
                    disabled={chooseRoleMutation.isPending}
                  >
                    Select Member
                  </Button>
                </div>

                <div className={`rounded-2xl border p-5 ${profile.roleIntent === "partner" || profile.partnerStatus !== "none" ? "border-primary bg-primary/10" : "border-border/50 bg-background/30"}`}>
                  <h3 className="text-lg font-black text-white">Partner</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Sell AI Agents, Co-op Pairs, and Full Teams after LMS eligibility and admin approval.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-widest">
                    <span className="rounded-full bg-background/60 px-3 py-1 text-muted-foreground">AI Agents</span>
                    <span className="rounded-full bg-background/60 px-3 py-1 text-muted-foreground">Co-op Pairs</span>
                    <span className="rounded-full bg-background/60 px-3 py-1 text-muted-foreground">Full Teams</span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant={profile.roleIntent === "partner" ? "default" : "outline"}
                      className="text-[11px] font-black uppercase tracking-widest"
                      onClick={() => chooseRoleMutation.mutate("partner")}
                      disabled={chooseRoleMutation.isPending}
                    >
                      Select Partner
                    </Button>
                    <Button
                      className="text-[11px] font-black uppercase tracking-widest"
                      onClick={() => partnerApplicationMutation.mutate()}
                      disabled={!canApply || partnerApplicationMutation.isPending}
                    >
                      {profile.partnerStatus === "pending" ? "Pending Review" : "Apply"}
                    </Button>
                  </div>
                  {!guidance.requiredChecklistComplete && (
                    <p className="mt-3 text-xs leading-relaxed text-amber-300">
                      Finish the required TECH AT NITE onboarding checklist before applying as a Partner.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-card/70 p-8">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                <ShieldCheck className={`h-4 w-4 ${profile.partnerStatus === "active" ? "text-emerald-500" : "text-amber-500"}`} />
                Review State
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Role intent</span>
                  <span className="font-black uppercase text-primary">{profile.roleIntent}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Partner status</span>
                  <span className="font-black uppercase text-primary">{profile.partnerStatus}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Application submitted</span>
                  <span className="font-black text-foreground">
                    {profile.applicationSubmittedAt ? new Date(profile.applicationSubmittedAt).toLocaleDateString() : "Not submitted"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Reviewed</span>
                  <span className="font-black text-foreground">
                    {profile.reviewedAt ? new Date(profile.reviewedAt).toLocaleDateString() : "Awaiting review"}
                  </span>
                </div>
              </div>

              {profile.reviewReason && (
                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100">
                  <div className="mb-2 flex items-center gap-2 font-black uppercase tracking-widest text-amber-400">
                    <BadgeCheck className="h-4 w-4" />
                    Review note
                  </div>
                  {profile.reviewReason}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <Link to="/lms/dashboard">
                  <Button variant="outline" className="text-[11px] font-black uppercase tracking-widest">
                    TECH AT NITE
                  </Button>
                </Link>
                <Link to="/xp/exchange">
                  <Button className="text-[11px] font-black uppercase tracking-widest">
                    Marketplace
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border/60 bg-card/70 p-8">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
              <Store className="h-4 w-4 text-primary" />
              Provider Profile
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Fill in the fields used for marketplace listings and partner review. These controls do not change
              company membership permissions.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Input
                placeholder="Display name"
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              />
              <Input
                placeholder="Headline"
                value={form.headline}
                onChange={(event) => setForm((current) => ({ ...current, headline: event.target.value }))}
              />
              <Input
                placeholder="Location"
                value={form.location}
                onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
              />
              <Input
                placeholder="Availability"
                value={form.availability}
                onChange={(event) => setForm((current) => ({ ...current, availability: event.target.value }))}
              />
              <Input
                placeholder="Skills (comma separated)"
                value={form.skills}
                onChange={(event) => setForm((current) => ({ ...current, skills: event.target.value }))}
              />
              <Input
                placeholder="Badges / certifications"
                value={form.badges}
                onChange={(event) => setForm((current) => ({ ...current, badges: event.target.value }))}
              />
              <Input
                placeholder="Supported run phases"
                value={form.supportedRunPhases}
                onChange={(event) => setForm((current) => ({ ...current, supportedRunPhases: event.target.value }))}
              />
              <Input
                placeholder="Payout wallet"
                value={form.payoutWallet}
                onChange={(event) => setForm((current) => ({ ...current, payoutWallet: event.target.value }))}
              />
            </div>

            <Textarea
              className="mt-4"
              rows={5}
              placeholder="Bio"
              value={form.bio}
              onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
            />

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                className="text-[11px] font-black uppercase tracking-widest"
                onClick={() => updateProfileMutation.mutate()}
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
              </Button>
              <Link to="/home">
                <Button variant="ghost" className="gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-white">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Network
                </Button>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}

import React from "react";
import {
  Compass,
  Filter,
  GraduationCap,
  Loader2,
  PlayCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wallet,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { amxApi, type Workshop } from "@/api/amx";
import { marketplaceApi } from "@/api/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeliverablesBriefcase } from "@/components/DeliverablesBriefcase";
import { useCompany } from "@/context/CompanyContext";
import { AIR_HUB_EMAILS, getCurrentAirHubLaneLabel } from "@/lib/air-hubs-lanes";
import { Link } from "@/lib/router";

function workshopActionLabel(workshop: Workshop) {
  const status = workshop.enrollment?.status;
  if (status === "completed" || status === "certified") return "Completed";
  if (status === "active_simulation") return "Complete";
  if (status === "enrolled") return workshop.category === "Simulation" ? "Launch Simulation" : "Complete";
  return workshop.category === "Simulation" ? "Launch Simulation" : "Enroll Now";
}

export function LmsDashboard() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();

  const { data, isLoading, error } = useQuery({
    queryKey: ["amx", "lms", selectedCompanyId],
    queryFn: () => amxApi.getLms(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const refreshLms = async () => {
    await queryClient.invalidateQueries({ queryKey: ["amx", "lms", selectedCompanyId] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace", "me"] });
    await queryClient.invalidateQueries({ queryKey: ["amx", "exchange", selectedCompanyId] });
  };

  const enrollMutation = useMutation({
    mutationFn: (workshopId: string) => amxApi.enrollInWorkshop(selectedCompanyId!, workshopId),
    onSuccess: refreshLms,
  });

  const launchMutation = useMutation({
    mutationFn: (workshopId: string) => amxApi.launchSimulation(selectedCompanyId!, workshopId),
    onSuccess: refreshLms,
  });

  const completeMutation = useMutation({
    mutationFn: (enrollmentId: string) => amxApi.completeEnrollment(selectedCompanyId!, enrollmentId),
    onSuccess: refreshLms,
  });

  const buyCreditsMutation = useMutation({
    mutationFn: () => marketplaceApi.topUpBalance("lms", 250),
    onSuccess: refreshLms,
  });

  const completeLessonMutation = useMutation({
    mutationFn: (lessonId: string) => amxApi.completeGuidanceLesson(selectedCompanyId!, lessonId),
    onSuccess: refreshLms,
  });

  const completeChecklistMutation = useMutation({
    mutationFn: (checklistId: string) => amxApi.completeGuidanceChecklist(selectedCompanyId!, checklistId),
    onSuccess: refreshLms,
  });

  const handleWorkshopAction = (workshop: Workshop) => {
    const status = workshop.enrollment?.status;
    if (status === "completed" || status === "certified") return;
    if (status === "active_simulation" && workshop.enrollment?.id) {
      completeMutation.mutate(workshop.enrollment.id);
      return;
    }
    if (status === "enrolled") {
      if (workshop.category === "Simulation") {
        launchMutation.mutate(workshop.id);
        return;
      }
      if (workshop.enrollment?.id) {
        completeMutation.mutate(workshop.enrollment.id);
      }
      return;
    }
    if (workshop.category === "Simulation") {
      launchMutation.mutate(workshop.id);
      return;
    }
    enrollMutation.mutate(workshop.id);
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500/60" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <p className="font-bold text-muted-foreground">Failed to load LMS data</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  const {
    workshops,
    stats,
    userLevel,
    userCredits,
    userTokenBalance,
    eligibility,
    marketplaceProfile,
    guidanceSections,
    guidanceProgress,
    requiredChecklistComplete,
    nextRecommendedStep,
  } = data;
  const partnerReady = eligibility.eligibleForPartner;
  const currentLane = getCurrentAirHubLaneLabel(
    marketplaceProfile.roleIntent,
    marketplaceProfile.partnerStatus,
  );

  return (
    <div className="flex min-h-screen flex-col bg-background/50 animate-in fade-in duration-500">
      <section className="border-b border-border/40 bg-accent/5 px-4 py-8 md:px-8 md:py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                <GraduationCap className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-foreground md:text-3xl">
                TECH AT NITE
              </h1>
            </div>
            <p className="max-w-3xl text-base font-medium leading-relaxed text-muted-foreground md:text-xl">
              Learn Mode powers Community readiness, Collective provider eligibility, and Elective buyer literacy.
              Complete workshops and simulations, earn certifications, and unlock the provider application path.
            </p>
          </div>

          <div className="grid min-w-[320px] gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                <Wallet className="h-4 w-4 text-amber-500" />
                LMS Credits
              </div>
              <div className="mt-3 text-3xl font-black text-amber-500">{userCredits}</div>
              <Button
                variant="outline"
                className="mt-4 h-9 w-full border-amber-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/10"
                onClick={() => buyCreditsMutation.mutate()}
                disabled={buyCreditsMutation.isPending}
              >
                {buyCreditsMutation.isPending ? "Processing..." : "Buy More Credits"}
              </Button>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                AMX Tokens
              </div>
              <div className="mt-3 text-3xl font-black text-primary">{userTokenBalance}</div>
              <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Separate marketplace payout balance
              </p>
            </div>
          </div>
        </div>
      </section>

      <main className="flex-1 px-4 py-6 md:px-8 md:py-10">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 lg:grid-cols-4 lg:gap-10">
          <aside className="space-y-6 lg:col-span-1">
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Trophy className="h-8 w-8" />
              </div>
              <h4 className="mt-4 text-[14px] font-black uppercase tracking-widest">Skill Mastery</h4>
              <p className="mt-1 text-[12px] font-medium text-muted-foreground">
                Level {userLevel} Advanced Learner
              </p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-accent">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, userLevel * 18)}%` }} />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.25em] text-foreground">
                <ShieldCheck className={`h-4 w-4 ${partnerReady ? "text-emerald-500" : "text-amber-500"}`} />
                Collective Eligibility
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {partnerReady
                  ? "You have completed the minimum v1 requirement and can apply to become a Collective provider."
                  : "Complete at least one required workshop or simulation bundle before submitting a Collective provider application."}
              </p>
              <div className="mt-5 space-y-3 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed enrollments</span>
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
                  <span className="text-muted-foreground">Current lane</span>
                  <span className="font-black uppercase text-primary">
                    {currentLane}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Guidance</span>
                  <span className={`font-black uppercase ${requiredChecklistComplete ? "text-emerald-500" : "text-amber-500"}`}>
                    {requiredChecklistComplete ? "complete" : "required"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Catalog</p>
              <div className="mt-4 flex flex-col gap-2">
                {["All Learning", "AI Workshops", "Market Simulations", "XR Design", "Leadership"].map((item) => (
                  <Button key={item} variant="ghost" className="justify-start px-3 text-[13px] font-medium">
                    {item}
                  </Button>
                ))}
              </div>
            </div>
          </aside>

          <div className="space-y-8 lg:col-span-3 md:space-y-10">
            <section className="rounded-3xl border border-primary/15 bg-card p-6 shadow-sm">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                    <ShieldCheck className="h-4 w-4" />
                    Start Here
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-foreground">TECH AT NITE onboarding</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Complete the guided LMS lessons and checklist before applying as a Collective provider.
                    This is the orientation layer for Community learners, Collective providers, Elective buyers,
                    credits, simulations, Pit Stop, live promotion, and marketplace microservices.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <span className="rounded-full bg-background/60 px-3 py-1">Community</span>
                    <span className="rounded-full bg-background/60 px-3 py-1">Collectives</span>
                    <span className="rounded-full bg-background/60 px-3 py-1">Electives</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-accent/5 p-5 md:min-w-[260px]">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Progress</div>
                  <div className="mt-3 text-3xl font-black text-primary">{guidanceProgress.progressPercent}%</div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/60">
                    <div className="h-full bg-primary" style={{ width: `${guidanceProgress.progressPercent}%` }} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{nextRecommendedStep}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4 text-sm leading-relaxed text-muted-foreground">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground">Community</div>
                  Learn, earn certifications, and stay connected through {AIR_HUB_EMAILS.community}.
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4 text-sm leading-relaxed text-muted-foreground">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground">Collectives</div>
                  Providers use TECH AT NITE to qualify for listings, simulations, and service quality loops via {AIR_HUB_EMAILS.collectives}.
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/40 p-4 text-sm leading-relaxed text-muted-foreground">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground">Electives</div>
                  Employers and universities use this guidance to hire, sponsor, and review outcomes through {AIR_HUB_EMAILS.electives}.
                </div>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {guidanceSections.map((section) => (
                  <div key={section.id} className="rounded-2xl border border-border/60 bg-background/40 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-black text-foreground">{section.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{section.description}</p>
                      </div>
                      <Link to={section.actionPath}>
                        <Button variant="outline" size="sm" className="text-[10px] font-black uppercase tracking-widest">
                          Open
                        </Button>
                      </Link>
                    </div>

                    <div className="mt-5 space-y-4">
                      {section.lessons.map((lesson) => (
                        <div key={lesson.id} className="rounded-xl border border-border/50 bg-card p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-black text-foreground">{lesson.title}</div>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{lesson.body}</p>
                            </div>
                            <Button
                              size="sm"
                              variant={lesson.completed ? "outline" : "default"}
                              className="shrink-0 text-[10px] font-black uppercase tracking-widest"
                              onClick={() => completeLessonMutation.mutate(lesson.id)}
                              disabled={lesson.completed || completeLessonMutation.isPending}
                            >
                              {lesson.completed ? "Done" : "Mark Done"}
                            </Button>
                          </div>
                        </div>
                      ))}

                      <div className="rounded-xl border border-border/50 bg-card p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Checklist</div>
                        <div className="mt-3 space-y-2">
                          {section.checklist.map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2">
                              <div className="text-sm text-foreground">{item.label}</div>
                              <Button
                                size="sm"
                                variant={item.completed ? "outline" : "secondary"}
                                className="shrink-0 text-[10px] font-black uppercase tracking-widest"
                                onClick={() => completeChecklistMutation.mutate(item.id)}
                                disabled={item.completed || completeChecklistMutation.isPending}
                              >
                                {item.completed ? "Checked" : "Check Off"}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search workshops & simulations..." className="h-11 bg-accent/5 pl-10" />
              </div>
              <Button variant="outline" className="h-11 gap-2 border-border/60 px-4">
                <Filter className="h-4 w-4" />
                <span>Filter</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {workshops.map((workshop) => {
                const busy =
                  enrollMutation.isPending || launchMutation.isPending || completeMutation.isPending;
                const isDone =
                  workshop.enrollment?.status === "completed" || workshop.enrollment?.status === "certified";
                const progress = workshop.enrollment?.progress ?? 0;

                return (
                  <div
                    key={workshop.id}
                    className="group relative flex flex-col rounded-2xl border border-border/60 bg-card transition-all duration-300 hover:border-amber-500/40 hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)]"
                  >
                    <div className="flex h-44 items-center justify-center overflow-hidden bg-accent/30 p-8">
                      {workshop.category === "Simulation" ? (
                        <Compass className="h-24 w-24 text-primary/20 transition-transform duration-500 group-hover:scale-110" />
                      ) : (
                        <Sparkles className="h-24 w-24 text-primary/20 transition-transform duration-500 group-hover:scale-110" />
                      )}
                    </div>

                    <div className="p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="rounded bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-500">
                          {workshop.category}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          <div className={`h-2.5 w-2.5 rounded-full ${workshop.level === "Advanced" ? "bg-rose-500" : "bg-emerald-500"}`} />
                          {workshop.level}
                        </div>
                      </div>

                      <h4 className="mb-3 text-[18px] font-black text-foreground transition-colors group-hover:text-amber-500">
                        {workshop.name}
                      </h4>
                      <p className="mb-4 line-clamp-2 text-[13px] font-medium leading-relaxed text-muted-foreground">
                        {workshop.description}
                      </p>

                      <div className="mb-5 rounded-xl border border-border/50 bg-accent/10 p-3 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-muted-foreground">Required</span>
                          <span className="font-black text-foreground">{workshop.creditsRequired} credits</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-medium text-muted-foreground">Progress</span>
                          <span className="font-black uppercase text-primary">
                            {workshop.enrollment?.status ?? "not started"}
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-border/60">
                          <div className="h-full bg-primary" style={{ width: `${Math.min(100, progress)}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/40 pt-5">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Earn</span>
                          <div className="text-xl font-black text-amber-500">{workshop.credits} Credits</div>
                        </div>
                        <Button
                          size="sm"
                          className="h-10 gap-2 bg-amber-500 px-6 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600"
                          onClick={() => handleWorkshopAction(workshop)}
                          disabled={busy || isDone}
                        >
                          {busy ? "Working..." : workshopActionLabel(workshop)}
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center md:p-10">
              <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-amber-500/10 blur-[100px]" />
              <div className="relative z-10 mx-auto max-w-2xl">
                <div className="mb-4 flex items-center justify-center gap-2">
                  <Compass className="h-5 w-5 text-amber-500 md:h-6 md:w-6" />
                  <span className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-500 md:text-[13px]">
                    Live Simulation
                  </span>
                </div>
                <h3 className="mb-4 text-2xl font-black text-foreground md:text-4xl">
                  West Louisville FoodPort
                </h3>
                <p className="mb-8 text-base font-medium leading-relaxed text-muted-foreground md:text-lg">
                  Launching the FoodPort simulation persists real LMS progress and counts toward partner eligibility.
                </p>
                <Button
                  className="h-auto w-full gap-3 whitespace-normal bg-white px-6 py-4 text-[12px] font-black uppercase tracking-[0.2em] text-black shadow-xl transition-all hover:bg-amber-500 hover:text-white sm:h-14 sm:w-auto sm:whitespace-nowrap sm:py-0"
                  onClick={() => {
                    const simulation = workshops.find((entry) => entry.category === "Simulation");
                    if (simulation) handleWorkshopAction(simulation);
                  }}
                  disabled={launchMutation.isPending}
                >
                  {launchMutation.isPending ? "Launching..." : "Launch Simulation"}
                  <Compass className="h-5 w-5 shrink-0" />
                </Button>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-border/60 bg-card p-6 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Certificates</p>
                <div className="mt-3 text-3xl font-black text-foreground">{stats.certificates}</div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Simulations Completed</p>
                <div className="mt-3 text-3xl font-black text-foreground">{stats.simulationsCompleted}</div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Hours Trained</p>
                <div className="mt-3 text-3xl font-black text-foreground">{stats.hoursTrained}</div>
              </div>
            </div>

            <div className="border-t border-border/40 pt-16 md:pt-20">
              <div className="mb-12">
                <h2 className="mb-3 text-[13px] font-black uppercase tracking-[0.3em] text-primary">Skill Outputs</h2>
                <h3 className="mb-4 text-3xl font-black text-foreground">Briefcase: Training Deliverables</h3>
                <p className="max-w-2xl text-sm font-medium leading-relaxed text-muted-foreground md:text-lg">
                  Review simulation and workshop outputs in a cleaner briefcase view with recent deliverables,
                  review-needed assets, and optional folder organization.
                </p>
              </div>
              <DeliverablesBriefcase />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

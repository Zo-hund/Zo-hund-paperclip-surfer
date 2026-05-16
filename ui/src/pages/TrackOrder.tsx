/**
 * TrackOrder — Public order tracking page for AMX fractal/micro sessions.
 * URL: /track/:identifier  (e.g. /track/AMXA-2573)
 * Polls GET /api/public/track/:identifier every 5s — no auth required.
 */

import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Bot,
  Zap,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { issuesApi } from "@/api/issues";

// ── Pipeline definition ───────────────────────────────────────────────────────

const PIPELINE = [
  {
    id: "queued",
    label: "Queued",
    sublabel: "Order received",
    icon: ClipboardList,
    activeColor: "text-sky-400",
    activeBg: "bg-sky-500/10",
    activeBorder: "border-sky-500/40",
    activeRing: "ring-sky-500/40",
  },
  {
    id: "assigned",
    label: "Assigned",
    sublabel: "Agent picked up",
    icon: Bot,
    activeColor: "text-blue-400",
    activeBg: "bg-blue-500/10",
    activeBorder: "border-blue-500/40",
    activeRing: "ring-blue-500/40",
  },
  {
    id: "running",
    label: "Running",
    sublabel: "Task executing",
    icon: Zap,
    activeColor: "text-amber-400",
    activeBg: "bg-amber-500/10",
    activeBorder: "border-amber-500/40",
    activeRing: "ring-amber-500/40",
  },
  {
    id: "review",
    label: "Review",
    sublabel: "Output check",
    icon: Eye,
    activeColor: "text-violet-400",
    activeBg: "bg-violet-500/10",
    activeBorder: "border-violet-500/40",
    activeRing: "ring-violet-500/40",
  },
  {
    id: "delivered",
    label: "Delivered",
    sublabel: "Complete",
    icon: CheckCircle2,
    activeColor: "text-emerald-400",
    activeBg: "bg-emerald-500/10",
    activeBorder: "border-emerald-500/40",
    activeRing: "ring-emerald-500/40",
  },
] as const;

type PipelineId = (typeof PIPELINE)[number]["id"];

function getActiveStep(status: string, agentName: string | null): number {
  if (status === "done") return 5;
  if (status === "in_review") return 4;
  if (status === "in_progress") return 3;
  if (agentName && (status === "todo" || status === "backlog")) return 2;
  return 1;
}

function isCancelled(status: string) {
  return status === "cancelled";
}

function isBlocked(status: string) {
  return status === "blocked";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    backlog:     { label: "Backlog",     color: "text-muted-foreground",  bg: "bg-border/20" },
    todo:        { label: "Queued",      color: "text-sky-400",           bg: "bg-sky-500/10" },
    in_progress: { label: "Running",     color: "text-amber-400",         bg: "bg-amber-500/10" },
    in_review:   { label: "In Review",   color: "text-violet-400",        bg: "bg-violet-500/10" },
    done:        { label: "Delivered",   color: "text-emerald-400",       bg: "bg-emerald-500/10" },
    cancelled:   { label: "Cancelled",   color: "text-rose-400",          bg: "bg-rose-500/10" },
    blocked:     { label: "Blocked",     color: "text-orange-400",        bg: "bg-orange-500/10" },
  };
  const cfg = map[status] ?? { label: status, color: "text-muted-foreground", bg: "bg-border/20" };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${cfg.color} ${cfg.bg}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {cfg.label}
    </span>
  );
}

// ── Step component ────────────────────────────────────────────────────────────

function PipelineStep({
  step,
  index,
  activeIndex,
  total,
}: {
  step: (typeof PIPELINE)[number];
  index: number;        // 1-based
  activeIndex: number;  // 1-based
  total: number;
}) {
  const Icon = step.icon;
  const completed = index < activeIndex;
  const active    = index === activeIndex;
  const future    = index > activeIndex;

  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      {/* Circle */}
      <div
        className={`relative w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
          completed
            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
            : active
            ? `${step.activeBg} ${step.activeBorder} ${step.activeColor} ring-2 ${step.activeRing} ring-offset-1 ring-offset-background`
            : "bg-card/20 border-border/20 text-muted-foreground/30"
        }`}
      >
        <Icon className="h-4.5 w-4.5" style={{ width: "1.125rem", height: "1.125rem" }} />
        {active && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        )}
        {completed && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500" />
        )}
      </div>

      {/* Labels */}
      <div className="text-center">
        <p className={`text-[11px] font-black uppercase tracking-widest leading-none mb-0.5 ${
          completed ? "text-emerald-400" : active ? step.activeColor : "text-muted-foreground/30"
        }`}>
          {step.label}
        </p>
        <p className={`text-[9px] font-medium leading-none ${
          active ? "text-muted-foreground" : "text-muted-foreground/30"
        }`}>
          {step.sublabel}
        </p>
      </div>

      {/* Connector line (not on last item) */}
      {index < total && (
        <div className="hidden" /> /* connectors rendered separately */
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TrackOrder() {
  const { identifier } = useParams<{ identifier: string }>();
  const id = identifier?.toUpperCase() ?? "";

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["track", id],
    queryFn: () => issuesApi.trackPublic(id),
    // Only poll when data was successfully fetched; don't retry-loop on 404
    refetchInterval: (query) => (query.state.status === "success" ? 5000 : false),
    enabled: !!id,
    retry: false,
    networkMode: "always",
  });

  const activeStep = data ? getActiveStep(data.status, data.agentName) : 1;
  const cancelled  = data ? isCancelled(data.status) : false;
  const blocked    = data ? isBlocked(data.status) : false;

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-12">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="mb-10">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
            AMX Order Tracker
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {id || "Order Status"}
            </h1>
            {data && <StatusChip status={data.status} />}
          </div>
          {data && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{data.title}</p>
          )}
        </div>

        {/* ── Loading ───────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-[13px] font-bold">Loading order status…</p>
          </div>
        )}

        {/* ── Error / Not found ─────────────────────────────────────────────── */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center gap-5 py-16 text-center">
            <div className="p-4 rounded-full bg-rose-500/10 border border-rose-500/20">
              <XCircle className="h-8 w-8 text-rose-400" />
            </div>
            <div>
              <p className="text-[15px] font-black text-foreground mb-1">Order not found</p>
              <p className="text-[12px] text-muted-foreground">
                No order matches <span className="font-black text-foreground">{id}</span>.
                Check the identifier and try again.
              </p>
            </div>
            <Link to="/request">
              <Button className="font-black text-[11px] uppercase tracking-widest gap-1.5">
                Submit a New Request <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}

        {/* ── Live order ────────────────────────────────────────────────────── */}
        {data && !isLoading && (
          <>
            {/* Cancelled / Blocked special state */}
            {(cancelled || blocked) && (
              <div className={`flex items-start gap-4 p-5 rounded-2xl border mb-8 ${
                cancelled
                  ? "bg-rose-500/5 border-rose-500/20"
                  : "bg-orange-500/5 border-orange-500/20"
              }`}>
                <div className={`p-2.5 rounded-xl ${cancelled ? "bg-rose-500/10" : "bg-orange-500/10"}`}>
                  {cancelled
                    ? <XCircle className="h-5 w-5 text-rose-400" />
                    : <AlertTriangle className="h-5 w-5 text-orange-400" />
                  }
                </div>
                <div>
                  <p className={`text-[13px] font-black mb-0.5 ${cancelled ? "text-rose-400" : "text-orange-400"}`}>
                    {cancelled ? "Order Cancelled" : "Order Blocked"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {cancelled
                      ? "This order was cancelled. Submit a new request if needed."
                      : "This order is waiting on something before it can continue."}
                  </p>
                </div>
              </div>
            )}

            {/* Pipeline stepper */}
            {!cancelled && (
              <div className="mb-8">
                <div className="relative flex items-start justify-between gap-0">
                  {/* Background connecting track */}
                  <div
                    className="absolute top-[22px] left-[calc(10%)] right-[calc(10%)] h-0.5 bg-border/20"
                    aria-hidden
                  />
                  {/* Progress fill */}
                  <div
                    className="absolute top-[22px] left-[calc(10%)] h-0.5 bg-emerald-500/40 transition-all duration-700"
                    style={{ width: `calc(${((activeStep - 1) / (PIPELINE.length - 1)) * 80}%)` }}
                    aria-hidden
                  />

                  {PIPELINE.map((step, i) => (
                    <PipelineStep
                      key={step.id}
                      step={step}
                      index={i + 1}
                      activeIndex={activeStep}
                      total={PIPELINE.length}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Order card */}
            <div className="rounded-2xl border border-border/40 bg-card/50 p-6 mb-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Task
                  </p>
                  <p className="text-[14px] font-black text-foreground leading-snug line-clamp-2">
                    {data.title}
                  </p>
                </div>
                {data.priority && (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-accent/10 border border-border/20 text-muted-foreground">
                    {data.priority}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Agent */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Agent
                  </p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-[12px] font-black text-foreground">
                      {data.agentName ?? "Unassigned"}
                    </span>
                  </div>
                </div>

                {/* Placed */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Placed
                  </p>
                  <p className="text-[12px] font-bold text-foreground">
                    {formatRelative(data.createdAt)}
                  </p>
                </div>

                {/* Updated */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Updated
                  </p>
                  <p className="text-[12px] font-bold text-foreground">
                    {formatRelative(data.updatedAt)}
                  </p>
                </div>
              </div>
            </div>

            {/* Live refresh indicator */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" style={{ animationDuration: "3s" }} />
                <span>Auto-refreshing every 5s</span>
                {dataUpdatedAt > 0 && (
                  <span className="opacity-60">· Last: {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </div>
            </div>

            {/* CTA strip */}
            <div className="rounded-2xl border border-border/30 bg-card/30 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-[12px] font-black text-foreground mb-0.5">Need to book another session?</p>
                <p className="text-[11px] text-muted-foreground">View the full schedule or submit a custom request.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link to="/booking">
                  <Button variant="outline" className="h-9 font-black text-[11px] uppercase tracking-widest">
                    View Schedule
                  </Button>
                </Link>
                <Link to="/request">
                  <Button className="h-9 font-black text-[11px] uppercase tracking-widest gap-1.5">
                    New Request <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </PublicLayout>
  );
}

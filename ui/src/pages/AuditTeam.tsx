import React, { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/context/CompanyContext";
import { Button } from "@/components/ui/button";

// ── API helpers ──────────────────────────────────────────────────────────────

async function fetchJson(url: string) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function auditApi(companyId: string) {
  const base = `/api/companies/${companyId}/audit`;
  return {
    team: () => fetchJson(`${base}/team`),
    stats: () => fetchJson(`${base}/stats`),
    verifications: () => fetchJson(`${base}/verifications?limit=100`),
  };
}

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  passed: { label: "Passed", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
  flagged: { label: "Flagged", icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" },
  in_progress: { label: "In Progress", icon: Loader2, color: "text-blue-400", bg: "bg-blue-400/10" },
  pending: { label: "Pending", icon: Clock, color: "text-muted-foreground", bg: "bg-muted/30" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${cfg.color} ${cfg.bg}`}>
      <Icon className={`h-3 w-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}

// ── Finding row ──────────────────────────────────────────────────────────────

function FindingRow({ finding }: { finding: { severity: string; category: string; description: string; evidence?: string } }) {
  const [open, setOpen] = useState(false);
  const severityColor =
    finding.severity === "critical" ? "text-red-500" :
    finding.severity === "major" ? "text-amber-500" : "text-yellow-400";

  return (
    <div className="border border-border/50 rounded p-2 text-xs space-y-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className={`font-bold uppercase ${severityColor}`}>{finding.severity}</span>
        <span className="text-muted-foreground font-mono">[{finding.category}]</span>
        <span className="truncate">{finding.description}</span>
      </button>
      {open && finding.evidence && (
        <pre className="ml-5 text-[10px] text-muted-foreground bg-muted/30 rounded p-1.5 overflow-x-auto whitespace-pre-wrap">
          {finding.evidence}
        </pre>
      )}
    </div>
  );
}

// ── Verification card ────────────────────────────────────────────────────────

function VerificationCard({ verification }: { verification: any }) {
  const [open, setOpen] = useState(false);
  const findings: any[] = verification.findings ?? [];

  return (
    <div className="border border-border/50 rounded-lg p-4 space-y-2 bg-card/50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold leading-tight">
            {verification.targetLabel ?? verification.targetId}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {verification.targetType.toUpperCase()} · {verification.id.slice(0, 8)}
          </p>
        </div>
        <StatusBadge status={verification.status} />
      </div>

      {verification.verdict && (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-2 italic">
          {verification.verdict}
        </p>
      )}

      {verification.certificateFootprint && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-500">
          <BadgeCheck className="h-3.5 w-3.5" />
          <span className="font-mono truncate">{verification.certificateFootprint}</span>
        </div>
      )}

      {findings.length > 0 && (
        <div>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-amber-500 font-semibold"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {findings.length} finding{findings.length > 1 ? "s" : ""}
          </button>
          {open && (
            <div className="mt-2 space-y-1">
              {findings.map((f, i) => <FindingRow key={i} finding={f} />)}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/50">
        {verification.completedAt
          ? `Completed ${new Date(verification.completedAt).toLocaleString()}`
          : `Started ${new Date(verification.createdAt).toLocaleString()}`}
      </p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function AuditTeam() {
  const { selectedCompanyId } = useCompany();
  const [filter, setFilter] = useState<string>("all");

  const teamQ = useQuery({
    queryKey: ["audit", "team", selectedCompanyId],
    queryFn: () => auditApi(selectedCompanyId!).team(),
    enabled: !!selectedCompanyId,
  });

  const statsQ = useQuery({
    queryKey: ["audit", "stats", selectedCompanyId],
    queryFn: () => auditApi(selectedCompanyId!).stats(),
    enabled: !!selectedCompanyId,
  });

  const verificationsQ = useQuery({
    queryKey: ["audit", "verifications", selectedCompanyId],
    queryFn: () => auditApi(selectedCompanyId!).verifications(),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const team: any[] = teamQ.data?.team ?? [];
  const stats = statsQ.data ?? { total: 0, passed: 0, failed: 0, pending: 0, passRate: 0 };
  const allVerifications: any[] = verificationsQ.data?.verifications ?? [];

  const filtered =
    filter === "all"
      ? allVerifications
      : allVerifications.filter((v) => v.status === filter || (filter === "flagged" && v.status === "flagged"));

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {/* Header */}
      <section className="px-4 md:px-8 py-8 border-b border-border/40 bg-accent/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground uppercase">
                  Audit Team
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono uppercase tracking-widest">
                  V3 · Real-Result Verification · AMX Chain Certified
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              Auditor agents verify that every completed task produced real, measurable output.
              Passing tasks receive an immutable AMX Chain certificate. Failing tasks surface
              structured findings for the board.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            {[
              { label: "Pass Rate", value: `${stats.passRate}%`, color: "text-emerald-400" },
              { label: "Passed", value: stats.passed, color: "text-emerald-400" },
              { label: "Failed / Flagged", value: stats.failed, color: "text-red-400" },
              { label: "Pending", value: stats.pending, color: "text-muted-foreground" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border/50 bg-card/60 p-3 text-center">
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Audit Team Roster */}
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/80">
              Auditor Roster
            </h2>
            <span className="ml-auto text-xs text-muted-foreground">{team.length} agents</span>
          </div>

          {teamQ.isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400/60" />
            </div>
          ) : team.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
              <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm font-semibold text-muted-foreground">No auditors yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Hire an agent and set their role to <span className="font-mono">auditor</span>
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => (window.location.href = "/agents/new")}
              >
                Hire Auditor
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {team.map((agent) => (
                <a
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 hover:bg-accent/30 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-4 w-4 text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{agent.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase">{agent.status}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Verifications feed */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <ShieldX className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/80">
              Verifications
            </h2>
            <div className="ml-auto flex items-center gap-1">
              {["all", "passed", "failed", "flagged", "in_progress", "pending"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                    filter === s
                      ? "bg-violet-500/20 text-violet-300"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "in_progress" ? "Active" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {verificationsQ.isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400/60" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
              <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-semibold text-muted-foreground">No verifications yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Auditor agents will post results here as they verify completed tasks.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => (
                <VerificationCard key={item.id} verification={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Copy,
  Cpu,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  HelpCircle,
  Inbox,
  Laptop,
  LockKeyhole,
  MessageSquare,
  MonitorSmartphone,
  Network,
  Play,
  Plug,
  RadioTower,
  RefreshCw,
  Route,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Smartphone,
  Tablet,
  TerminalSquare,
  Users,
  Video,
  Volume2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type {
  AmxCommandRiskLevel,
  AmxDispatchEvidence,
  AmxDispatchLease,
  AmxNode,
  AmxNodeCapability,
  AmxNodeKind,
} from "@paperclipai/shared";
import {
  AMX_COMMAND_RISK_LEVELS,
  AMX_NODE_CONNECTION_MODES,
  AMX_NODE_CAPABILITIES,
  AMX_NODE_KINDS,
  AMX_NODE_TRUST_TIERS,
} from "@paperclipai/shared";
import { amxNodesApi } from "../api/amxNodes";
import { mcpServersApi } from "../api/mcpServers";
import { meetingsApi } from "../api/meetings";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useMeeting } from "../context/MeetingContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RuntimeTarget =
  | "local"
  | "cloud"
  | "huggingface"
  | "openrouter"
  | "kimi"
  | "minimax"
  | "claude"
  | "codex"
  | "gemini";

type EnrollmentDraft = {
  name: string;
  kind: AmxNodeKind;
  trustTier: AmxNode["trustTier"];
  connectionMode: AmxNode["connectionMode"];
  capabilities: AmxNodeCapability[];
  labelText: string;
  allowReadRoot: string;
  statePath: string;
};

const runtimeTargets: { id: RuntimeTarget; label: string; helper: string }[] = [
  { id: "local", label: "Local", helper: "Prefer enrolled local hardware" },
  { id: "cloud", label: "Cloud", helper: "Route to hosted workers" },
  { id: "huggingface", label: "Hugging Face", helper: "Hub or inference provider" },
  { id: "openrouter", label: "OpenRouter", helper: "Multi-model gateway" },
  { id: "kimi", label: "Kimi", helper: "Moonshot/Kimi cloud family" },
  { id: "minimax", label: "MiniMax", helper: "MiniMax cloud family" },
  { id: "claude", label: "Claude", helper: "Claude local/cloud adapter" },
  { id: "codex", label: "Codex", helper: "Codex local adapter" },
  { id: "gemini", label: "Gemini", helper: "Gemini local/cloud adapter" },
];

const kindIcons: Record<AmxNodeKind, typeof Laptop> = {
  local_desktop: MonitorSmartphone,
  laptop: Laptop,
  phone: Smartphone,
  tablet: Tablet,
  hmd: MonitorSmartphone,
  cloud_vm: Cloud,
  cloud_container: Cpu,
  edge_device: RadioTower,
};

const riskTone: Record<AmxCommandRiskLevel, string> = {
  view: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  read: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  write: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  execute: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  destructive: "border-red-500/30 bg-red-500/10 text-red-300",
};

const routeLabels: Record<AmxNode["connectionMode"], string> = {
  local_loopback: "Local loopback",
  outbound_websocket: "Outbound websocket",
  cloudflare_tunnel: "Cloudflare tunnel",
  tailscale: "Tailscale",
  webrtc_relay: "WebRTC relay",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatTime(value: Date | string | null | undefined) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function minutesSince(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
}

function summarizeScope(scope: Record<string, unknown>) {
  const keys = Object.keys(scope);
  if (keys.length === 0) return "company scope";
  return keys
    .slice(0, 3)
    .map((key) => `${key}:${String(scope[key]).slice(0, 24)}`)
    .join(" / ");
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function joinCommand(parts: string[]) {
  return parts.join(" \\\n  ");
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function metricValue(label: string, value: number | string, tone = "text-foreground") {
  return (
    <div className="rounded-lg border border-border/60 bg-card/70 px-4 py-3 shadow-sm">
      <div className={cn("text-2xl font-black leading-none", tone)}>{value}</div>
      <div className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function nodeHealth(node: AmxNode) {
  if (node.status === "suspended") return { label: "suspended", tone: "text-red-300", dot: "bg-red-400" };
  if (node.status === "offline") return { label: "offline", tone: "text-zinc-400", dot: "bg-zinc-500" };
  if (node.status === "degraded") return { label: "degraded", tone: "text-amber-300", dot: "bg-amber-400" };
  const staleMinutes = minutesSince(node.lastSeenAt);
  if (staleMinutes !== null && staleMinutes > 10) {
    return { label: "stale", tone: "text-amber-300", dot: "bg-amber-400" };
  }
  return { label: node.status, tone: "text-emerald-300", dot: "bg-emerald-400" };
}

function NodeRow({
  node,
  selected,
  onSelect,
}: {
  node: AmxNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = kindIcons[node.kind];
  const health = nodeHealth(node);
  const visibleCapabilities = node.capabilities.slice(0, 3);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary/70 bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]"
          : "border-border/60 bg-background/60 hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-md border border-border/60 bg-card p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-black uppercase tracking-wide">{node.name}</div>
            <div className={cn("flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider", health.tone)}>
              <span className={cn("h-2 w-2 rounded-full", health.dot)} />
              {health.label}
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span>{formatLabel(node.kind)}</span>
            <span>/</span>
            <span>{formatLabel(node.trustTier)}</span>
            <span>/</span>
            <span>{formatLabel(node.connectionMode)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {visibleCapabilities.map((capability) => (
              <Badge key={capability} variant="secondary" className="rounded px-1.5 py-0 text-[9px] uppercase">
                {formatLabel(capability)}
              </Badge>
            ))}
            {node.capabilities.length > visibleCapabilities.length && (
              <Badge variant="outline" className="rounded px-1.5 py-0 text-[9px] uppercase">
                +{node.capabilities.length - visibleCapabilities.length}
              </Badge>
            )}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Last heartbeat: {formatTime(node.lastSeenAt)}
          </div>
        </div>
      </div>
    </button>
  );
}

function LeaseRow({
  lease,
  nodeName,
  selected,
  onSelect,
}: {
  lease: AmxDispatchLease;
  nodeName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary/70 bg-primary/10"
          : "border-border/60 bg-background/60 hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{lease.commandSummary}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {nodeName} / {formatLabel(lease.capability)} / expires {formatTime(lease.expiresAt)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="outline" className={cn("rounded uppercase", riskTone[lease.riskLevel])}>
            {lease.riskLevel}
          </Badge>
          <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            {formatLabel(lease.status)}
          </span>
        </div>
      </div>
      <div className="mt-2 text-[10px] font-mono text-muted-foreground">{summarizeScope(lease.scope)}</div>
    </button>
  );
}

function EvidenceRow({
  evidence,
  nodeName,
}: {
  evidence: AmxDispatchEvidence;
  nodeName: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-3.5 w-3.5 text-emerald-300" />
            <span className="truncate text-sm font-semibold">{evidence.commandSummary}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {nodeName} / {formatLabel(evidence.capability)} / received {formatTime(evidence.receivedAt)}
          </div>
        </div>
        <Badge variant="outline" className={cn("rounded uppercase", riskTone[evidence.riskLevel])}>
          {evidence.status}
        </Badge>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] font-mono text-emerald-200">
        <Fingerprint className="h-3 w-3 shrink-0" />
        <span className="truncate">{evidence.resultSha256}</span>
      </div>
    </div>
  );
}

function RunGuideStep({
  done,
  active,
  title,
  body,
}: {
  done: boolean;
  active: boolean;
  title: string;
  body: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        done
          ? "border-emerald-500/30 bg-emerald-500/10"
          : active
            ? "border-primary/40 bg-primary/10"
            : "border-border/60 bg-background/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black",
            done
              ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
              : active
                ? "border-primary bg-primary/20 text-primary"
                : "border-border text-muted-foreground",
          )}
        >
          {done ? "✓" : active ? "•" : ""}
        </div>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{body}</div>
        </div>
      </div>
    </div>
  );
}

function CommandBlock({
  title,
  command,
  copied,
  onCopy,
}: {
  title: string;
  command: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </span>
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "h-7 gap-1.5 text-[11px]",
            copied && "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
          )}
          onClick={onCopy}
        >
          {copied ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground">
        {command}
      </pre>
    </div>
  );
}

function CommunicationOption({
  icon: Icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-3">
      <div className="flex items-start gap-3">
        <div className="rounded-md border border-primary/30 bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black uppercase tracking-wider">{title}</div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</div>
          {action && onAction ? (
            <Button size="sm" variant="outline" className="mt-3 h-8 gap-1.5 text-[11px]" onClick={onAction}>
              {action}
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AmxDispatchConsole() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const meetingHub = useMeeting();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId;
  const companyRoutePrefix = selectedCompany?.issuePrefix ?? "AMX";
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [capability, setCapability] = useState<AmxNodeCapability>("heartbeat_worker");
  const [riskLevel, setRiskLevel] = useState<AmxCommandRiskLevel>("view");
  const [runtimeTarget, setRuntimeTarget] = useState<RuntimeTarget>("local");
  const [commandSummary, setCommandSummary] = useState("Heartbeat worker status probe");
  const [createdLeaseToken, setCreatedLeaseToken] = useState<string | null>(null);
  const [createdLeaseId, setCreatedLeaseId] = useState<string>("");
  const [selectedLeaseId, setSelectedLeaseId] = useState<string>("");
  const [runGuideOpen, setRunGuideOpen] = useState(false);
  const [guideAgentOpen, setGuideAgentOpen] = useState(false);
  const [copiedCommandKey, setCopiedCommandKey] = useState<string>("");
  const [enrollmentDraft, setEnrollmentDraft] = useState<EnrollmentDraft>({
    name: "AMX local node",
    kind: "local_desktop",
    trustTier: "paired",
    connectionMode: "outbound_websocket",
    capabilities: ["heartbeat_worker", "filesystem_read", "local_models", "git"],
    labelText: "role=operator device=primary",
    allowReadRoot: "~/Documents",
    statePath: "~/.paperclip/amx-node.json",
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "AMX Local + Cloud Work Mesh" }]);
  }, [setBreadcrumbs]);

  const nodesQuery = useQuery({
    queryKey: companyId ? queryKeys.amxNodes.list(companyId) : ["amx-nodes", "disabled"],
    queryFn: () => amxNodesApi.list(companyId!),
    enabled: !!companyId,
    refetchInterval: 15_000,
  });

  const leasesQuery = useQuery({
    queryKey: companyId ? queryKeys.amxNodes.leases(companyId) : ["amx-leases", "disabled"],
    queryFn: () => amxNodesApi.listLeases(companyId!),
    enabled: !!companyId,
    refetchInterval: 10_000,
  });

  const evidenceQuery = useQuery({
    queryKey: companyId ? queryKeys.amxNodes.evidence(companyId) : ["amx-evidence", "disabled"],
    queryFn: () => amxNodesApi.listEvidence(companyId!),
    enabled: !!companyId,
    refetchInterval: 15_000,
  });

  const mcpQuery = useQuery({
    queryKey: companyId ? queryKeys.mcpServers.list(companyId) : ["mcp-servers", "disabled"],
    queryFn: () => mcpServersApi.list(companyId!),
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const nodes = nodesQuery.data ?? [];
  const leases = leasesQuery.data ?? [];
  const evidence = evidenceQuery.data ?? [];
  const mcpServers = mcpQuery.data ?? [];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0] ?? null;

  useEffect(() => {
    if (!selectedNodeId && nodes[0]) setSelectedNodeId(nodes[0].id);
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (selectedNode && !selectedNode.capabilities.includes(capability) && selectedNode.capabilities[0]) {
      setCapability(selectedNode.capabilities[0]);
    }
  }, [capability, selectedNode]);

  const nodeNameById = useMemo(() => {
    return new Map(nodes.map((node) => [node.id, node.name]));
  }, [nodes]);

  const activeLeases = leases.filter((lease) => lease.status === "granted" || lease.status === "pending_approval");
  const executableLeases = leases.filter((lease) => lease.status === "granted");
  const selectedLease =
    leases.find((lease) => lease.id === selectedLeaseId) ??
    leases.find((lease) => lease.id === createdLeaseId) ??
    executableLeases[0] ??
    null;
  const policyBlocks = leases.filter((lease) => lease.status === "denied" || lease.status === "revoked").length;
  const nodesOnline = nodes.filter((node) => ["online", "idle", "busy"].includes(node.status)).length;
  const enabledMcpServers = mcpServers.filter((server) => server.enabled).length;
  const selectedLeaseEvidence = selectedLease
    ? evidence.find((entry) => entry.leaseId === selectedLease.id) ?? null
    : null;
  const matchingEnrollment = nodes.find(
    (node) => node.name.trim().toLowerCase() === enrollmentDraft.name.trim().toLowerCase(),
  );
  const routeHealth = AMX_NODE_CONNECTION_MODES.map((mode) => {
    const routedNodes = nodes.filter((node) => node.connectionMode === mode);
    const onlineNodes = routedNodes.filter((node) => ["online", "idle", "busy"].includes(node.status));
    return {
      mode,
      label: routeLabels[mode],
      total: routedNodes.length,
      online: onlineNodes.length,
      healthy: onlineNodes.length > 0,
    };
  });
  const operatorTodos = [
    {
      title: "Enroll a trusted node",
      done: nodes.length > 0,
      detail: nodes.length > 0 ? `${nodes.length} node(s) enrolled` : "Run the generated enroll command on a device.",
    },
    {
      title: "Confirm live route heartbeat",
      done: nodesOnline > 0,
      detail: nodesOnline > 0 ? `${nodesOnline} node(s) online` : "Start a node and wait for heartbeat refresh.",
    },
    {
      title: "Enable context tools",
      done: enabledMcpServers > 0,
      detail:
        enabledMcpServers > 0
          ? `${enabledMcpServers} MCP server(s) enabled`
          : "Connect at least one MCP server for routed work.",
    },
    {
      title: "Create a dispatch lease",
      done: leases.some((lease) => lease.status === "granted" || lease.status === "consumed"),
      detail:
        leases.length > 0
          ? `${leases.length} lease(s) created`
          : "Choose a node, route, capability, and risk level.",
    },
    {
      title: "Return OPPRRC evidence",
      done: evidence.length > 0,
      detail:
        evidence.length > 0
          ? `${evidence.length} evidence record(s) received`
          : "Execute with --submit from an enrolled node.",
    },
    {
      title: "Review blocked policy events",
      done: policyBlocks === 0,
      detail:
        policyBlocks === 0
          ? "No denied or revoked lease events"
          : `${policyBlocks} policy event(s) need review.`,
    },
  ];
  const guideAgentPrompts = [
    "Summarize current dispatch health, blocked policy events, stale routes, and missing evidence.",
    "Open a Meeting Hub agenda for this dispatch lease and assign voice, chat, inbox, and MCP follow-up owners.",
    "Ask the agent team which runtime route is safest: local node, cloud worker, Hugging Face, OpenRouter, Kimi, MiniMax, Claude, Codex, or Gemini.",
  ];

  function openCompanyRoute(path: string) {
    navigate(`/${companyRoutePrefix}${path}`);
  }

  useEffect(() => {
    if (!selectedLeaseId && selectedLease) setSelectedLeaseId(selectedLease.id);
  }, [selectedLease, selectedLeaseId]);

  const enrollmentCommand = useMemo(() => {
    const baseUrl = `${window.location.origin.replace(/\/+$/, "")}/api`;
    const labels = enrollmentDraft.labelText
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .flatMap((entry) => ["--label", shellQuote(entry)]);
    const readRoots = enrollmentDraft.allowReadRoot
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .flatMap((entry) => ["--allow-read-root", shellQuote(entry)]);

    return joinCommand([
      "paperclipai",
      "--api-base",
      shellQuote(baseUrl),
      "--company-id",
      shellQuote(companyId ?? "<company-id>"),
      "amx-node",
      "enroll",
      "--state",
      shellQuote(enrollmentDraft.statePath),
      "--name",
      shellQuote(enrollmentDraft.name || "AMX node"),
      "--kind",
      enrollmentDraft.kind,
      "--trust-tier",
      enrollmentDraft.trustTier,
      "--connection-mode",
      enrollmentDraft.connectionMode,
      "--capabilities",
      shellQuote(enrollmentDraft.capabilities.join(",")),
      ...labels,
      ...readRoots,
    ]);
  }, [companyId, enrollmentDraft]);

  const executeCommand = useMemo(() => {
    return joinCommand([
      "paperclipai",
      "amx-node",
      "execute",
      "--state",
      shellQuote(enrollmentDraft.statePath),
      "--lease-id",
      shellQuote(selectedLease?.id ?? "<lease-id>"),
      "--lease-token",
      shellQuote(createdLeaseToken ?? "<one-time-token>"),
      "--submit",
      "--json",
    ]);
  }, [createdLeaseToken, enrollmentDraft.statePath, selectedLease?.id]);

  const pollCommand = useMemo(() => {
    return joinCommand([
      "paperclipai",
      "amx-node",
      "poll",
      "--state",
      shellQuote(enrollmentDraft.statePath),
      "--json",
    ]);
  }, [enrollmentDraft.statePath]);

  async function copyCommand(value: string, title = "Copied to clipboard", key = title) {
    try {
      await copyText(value);
      setCopiedCommandKey(key);
      pushToast({ title, tone: "success" });
      window.setTimeout(() => {
        setCopiedCommandKey((current) => (current === key ? "" : current));
      }, 2400);
    } catch {
      pushToast({ title: "Clipboard unavailable", body: "Select and copy the command manually.", tone: "warn" });
    }
  }

  function updateEnrollmentDraft(patch: Partial<EnrollmentDraft>) {
    setEnrollmentDraft((current) => ({ ...current, ...patch }));
  }

  function toggleEnrollmentCapability(item: AmxNodeCapability) {
    setEnrollmentDraft((current) => {
      const next = current.capabilities.includes(item)
        ? current.capabilities.filter((entry) => entry !== item)
        : [...current.capabilities, item];
      return { ...current, capabilities: next.length > 0 ? next : ["heartbeat_worker"] };
    });
  }

  const createLeaseMutation = useMutation({
    mutationFn: () =>
      amxNodesApi.createLease(companyId!, {
        nodeId: selectedNode!.id,
        capability,
        riskLevel,
        commandSummary,
        scope: {
          runtimeTarget,
          routeMode: selectedNode?.connectionMode,
          operatorIntent: "dispatch_console",
          mcpServersEnabled: enabledMcpServers,
          requestedPolicy:
            riskLevel === "view" || riskLevel === "read" ? "auto_granted" : "approval_required",
        },
        ttlSeconds: 900,
      }),
    onSuccess: (lease) => {
      setCreatedLeaseToken(lease.leaseToken);
      setCreatedLeaseId(lease.id);
      setSelectedLeaseId(lease.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.amxNodes.leases(companyId!) });
      pushToast({ title: "Dispatch lease created", body: "The node can now poll or execute the scoped lease." });
    },
    onError: (error) => {
      pushToast({
        tone: "warn",
        title: "Failed to create dispatch lease",
        body: error instanceof Error ? error.message : "Check node policy and try again.",
      });
    },
  });

  const revokeLeaseMutation = useMutation({
    mutationFn: (leaseId: string) => amxNodesApi.revokeLease(companyId!, leaseId),
    onSuccess: (lease) => {
      setSelectedLeaseId(lease.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.amxNodes.leases(companyId!) });
      pushToast({ title: "Dispatch lease revoked", body: "The node can no longer consume this lease." });
    },
    onError: (error) => {
      pushToast({
        tone: "warn",
        title: "Failed to revoke dispatch lease",
        body: error instanceof Error ? error.message : "Check the lease and try again.",
      });
    },
  });

  const reissueLeaseMutation = useMutation({
    mutationFn: (lease: AmxDispatchLease) =>
      amxNodesApi.createLease(companyId!, {
        nodeId: lease.nodeId,
        capability: lease.capability,
        riskLevel: lease.riskLevel,
        commandSummary: lease.commandSummary,
        scope: {
          ...lease.scope,
          reissuedFromLeaseId: lease.id,
          operatorIntent: "dispatch_console_reissue",
        },
        ttlSeconds: 900,
      }),
    onSuccess: (lease) => {
      setCreatedLeaseToken(lease.leaseToken);
      setCreatedLeaseId(lease.id);
      setSelectedLeaseId(lease.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.amxNodes.leases(companyId!) });
      pushToast({ title: "Dispatch lease reissued", body: "A fresh one-time token is ready to copy." });
    },
    onError: (error) => {
      pushToast({
        tone: "warn",
        title: "Failed to reissue dispatch lease",
        body: error instanceof Error ? error.message : "Check node policy and try again.",
      });
    },
  });

  const startDispatchMeetingMutation = useMutation({
    mutationFn: () =>
      meetingsApi.start({
        companyId: companyId!,
        title: `AMX Local + Cloud Ops - ${new Date().toLocaleString()}`,
        type: "dispatch_ops",
      }),
    onSuccess: (meeting) => {
      meetingHub.startMeeting(meeting.id, meeting.title);
      setGuideAgentOpen(false);
      pushToast({
        title: "Meeting Hub connected",
        body: "Dispatch Ops is live with voice, chat, cockpit, and agent relay context.",
      });
      openCompanyRoute("/meetings");
    },
    onError: (error) => {
      pushToast({
        tone: "warn",
        title: "Failed to start Meeting Hub",
        body: error instanceof Error ? error.message : "Check meeting service status and try again.",
      });
    },
  });

  if (!companyId) {
    return (
      <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
        Select a company to open AMX Local + Cloud Work Mesh.
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-background/50 px-4 py-5 md:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-border/50 pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary">
                <Route className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-black uppercase tracking-tight md:text-3xl">
                AMX Local + Cloud Work Mesh
              </h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Route governed work to local machines, cloud workers, and mobile or edge devices with signed leases, MCP-aware context,
              and OPPRRC evidence return.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:max-w-2xl xl:w-auto">
            <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
              <Button variant="outline" className="gap-2" onClick={() => setGuideAgentOpen(true)}>
                <HelpCircle className="h-4 w-4" />
                How to Use
              </Button>
              <Button
                className="gap-2"
                onClick={() => startDispatchMeetingMutation.mutate()}
                disabled={startDispatchMeetingMutation.isPending}
              >
                <Users className="h-4 w-4" />
                {startDispatchMeetingMutation.isPending ? "Starting..." : "Start Meeting Hub"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {metricValue("Nodes Online", `${nodesOnline}/${nodes.length}`, "text-emerald-300")}
              {metricValue("Active Leases", activeLeases.length, "text-primary")}
              {metricValue("Evidence", evidence.length, "text-emerald-300")}
              {metricValue("Policy Blocks", policyBlocks, policyBlocks > 0 ? "text-amber-300" : "text-muted-foreground")}
            </div>
          </div>
        </header>

        <Card className="border-border/70 bg-card/80 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <ServerCog className="h-4 w-4" />
                <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Operator Todo List</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Live build checklist for zero-trust dispatch across local devices, cloud routes, MCP context, and evidence return.
              </p>
            </div>
            <Badge variant="outline" className="w-fit rounded uppercase">
              {operatorTodos.filter((todo) => todo.done).length}/{operatorTodos.length} complete
            </Badge>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {operatorTodos.map((todo) => (
              <div
                key={todo.title}
                className={cn(
                  "rounded-lg border px-3 py-2",
                  todo.done
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-border/60 bg-background/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className={cn("h-4 w-4", todo.done ? "text-emerald-300" : "text-muted-foreground")} />
                  <span className="text-xs font-black uppercase tracking-wider">{todo.title}</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{todo.detail}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)] min-[1800px]:grid-cols-[360px_minmax(0,1fr)_380px]">
          <section className="space-y-4">
            <Card className="overflow-hidden border-border/70 bg-card/80">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div>
                  <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Device Mesh</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">Trust, route, and capability awareness.</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    nodesQuery.refetch();
                    leasesQuery.refetch();
                    evidenceQuery.refetch();
                  }}
                >
                  <RefreshCw className={cn("h-4 w-4", nodesQuery.isFetching && "animate-spin")} />
                </Button>
              </div>
              <div className="space-y-2 p-3">
                {nodes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <Network className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-semibold">No AMX nodes enrolled yet.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enroll a device with the AMX node CLI, then leases can be routed here.
                    </p>
                  </div>
                ) : (
                  nodes.map((node) => (
                    <NodeRow
                      key={node.id}
                      node={node}
                      selected={selectedNode?.id === node.id}
                      onSelect={() => setSelectedNodeId(node.id)}
                    />
                  ))
                )}
              </div>
            </Card>

            <Card className="border-border/70 bg-card/80">
              <div className="border-b border-border/50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Enroll Node</h2>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Generate a secure device-side enrollment command.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 rounded uppercase",
                      matchingEnrollment
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                    )}
                  >
                    {matchingEnrollment ? "detected" : "waiting"}
                  </Badge>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <Input
                  value={enrollmentDraft.name}
                  onChange={(event) => updateEnrollmentDraft({ name: event.target.value })}
                  placeholder="Node name"
                  className="h-10"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={enrollmentDraft.kind}
                    onValueChange={(value) => updateEnrollmentDraft({ kind: value as AmxNodeKind })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AMX_NODE_KINDS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {formatLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={enrollmentDraft.trustTier}
                    onValueChange={(value) => updateEnrollmentDraft({ trustTier: value as AmxNode["trustTier"] })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AMX_NODE_TRUST_TIERS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {formatLabel(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select
                  value={enrollmentDraft.connectionMode}
                  onValueChange={(value) => updateEnrollmentDraft({ connectionMode: value as AmxNode["connectionMode"] })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AMX_NODE_CONNECTION_MODES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {formatLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={enrollmentDraft.labelText}
                  onChange={(event) => updateEnrollmentDraft({ labelText: event.target.value })}
                  placeholder="role=operator device=primary"
                  className="h-10"
                />
                <Input
                  value={enrollmentDraft.allowReadRoot}
                  onChange={(event) => updateEnrollmentDraft({ allowReadRoot: event.target.value })}
                  placeholder="Allowed read roots, comma separated"
                  className="h-10"
                />
                <div className="flex flex-wrap gap-1.5">
                  {AMX_NODE_CAPABILITIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleEnrollmentCapability(item)}
                      className={cn(
                        "rounded border px-2 py-1 text-[10px] font-black uppercase tracking-wider transition-colors",
                        enrollmentDraft.capabilities.includes(item)
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {formatLabel(item)}
                    </button>
                  ))}
                </div>
                {matchingEnrollment ? (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                    Enrollment detected for {matchingEnrollment.name}. Last heartbeat: {formatTime(matchingEnrollment.lastSeenAt)}.
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                    Waiting for this node name to enroll. Use the command below on the target device, then refresh.
                  </div>
                )}
                <CommandBlock
                  title="Enrollment command"
                  command={enrollmentCommand}
                  copied={copiedCommandKey === "enroll"}
                  onCopy={() => copyCommand(enrollmentCommand, "Enrollment command copied", "enroll")}
                />
              </div>
            </Card>

            <Card className="border-border/70 bg-card/80 p-4">
              <div className="flex items-center gap-2 text-primary">
                <LockKeyhole className="h-4 w-4" />
                <h3 className="text-[12px] font-black uppercase tracking-[0.24em]">Zero Trust Guardrails</h3>
              </div>
              <div className="mt-4 space-y-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Ed25519 node signatures on device endpoints
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  One-time hashed lease tokens
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  OPPRRC evidence hash recorded after execution
                </div>
              </div>
            </Card>
          </section>

          <main className="space-y-5">
            <Card className="border-border/70 bg-card/80">
              <div className="border-b border-border/50 px-4 py-3">
                <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Dispatch Board</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Create scoped work leases and choose the intended runtime route.
                </p>
              </div>

              <div className="space-y-5 p-4">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
                  {runtimeTargets.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => setRuntimeTarget(target.id)}
                      className={cn(
                        "min-h-[86px] rounded-lg border p-3 text-left transition-colors",
                        runtimeTarget === target.id
                          ? "border-primary/70 bg-primary/10 text-primary"
                          : "border-border/60 bg-background/50 hover:border-primary/40",
                      )}
                    >
                      <div className="break-words text-xs font-black uppercase leading-snug tracking-wider">
                        {target.label}
                      </div>
                      <div className="mt-2 text-[10px] leading-snug text-muted-foreground">{target.helper}</div>
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 2xl:grid-cols-[1.3fr_0.7fr]">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      Command summary
                    </label>
                    <Input
                      value={commandSummary}
                      onChange={(event) => setCommandSummary(event.target.value)}
                      placeholder="Describe the lease in operator-readable language"
                      className="h-11"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        Capability
                      </label>
                      <Select value={capability} onValueChange={(value) => setCapability(value as AmxNodeCapability)}>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AMX_NODE_CAPABILITIES.map((item) => (
                            <SelectItem
                              key={item}
                              value={item}
                              disabled={selectedNode ? !selectedNode.capabilities.includes(item) : false}
                            >
                              {formatLabel(item)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        Risk
                      </label>
                      <Select value={riskLevel} onValueChange={(value) => setRiskLevel(value as AmxCommandRiskLevel)}>
                        <SelectTrigger className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AMX_COMMAND_RISK_LEVELS.map((item) => (
                            <SelectItem key={item} value={item}>
                              {formatLabel(item)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/60 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        {selectedNode ? `Target: ${selectedNode.name}` : "Select an enrolled node"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Lease TTL: 15 minutes / Runtime: {runtimeTargets.find((target) => target.id === runtimeTarget)?.label}
                      </div>
                    </div>
                    <Button
                      onClick={() => createLeaseMutation.mutate()}
                      disabled={!selectedNode || !commandSummary.trim() || createLeaseMutation.isPending}
                      className="gap-2"
                    >
                      <Play className="h-4 w-4" />
                      {createLeaseMutation.isPending ? "Creating..." : "Create Lease"}
                    </Button>
                  </div>
                  {riskLevel !== "view" && riskLevel !== "read" ? (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      This risk level is marked for approval-first routing. The lease policy records that decision.
                    </div>
                  ) : null}
                  {createdLeaseToken ? (
                    <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
                          One-time lease token
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-100 hover:bg-emerald-500/20"
                          onClick={() => copyCommand(createdLeaseToken, "Lease token copied", "lease-token")}
                        >
                          {copiedCommandKey === "lease-token" ? (
                            <ClipboardCheck className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {copiedCommandKey === "lease-token" ? "Copied" : "Copy"}
                        </Button>
                      </div>
                      <div className="mt-1 break-all font-mono text-xs text-emerald-100">{createdLeaseToken}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card className="border-border/70 bg-card/80">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div>
                  <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Active Leases</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">Granted and approval-pending dispatch contracts.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded uppercase">
                    {leases.length} total
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[11px]"
                    onClick={() => selectedLease && reissueLeaseMutation.mutate(selectedLease)}
                    disabled={!selectedLease || reissueLeaseMutation.isPending}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {reissueLeaseMutation.isPending ? "Reissuing..." : "Reissue"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 border-red-500/30 bg-red-500/10 text-[11px] text-red-200 hover:bg-red-500/20"
                    onClick={() => selectedLease && revokeLeaseMutation.mutate(selectedLease.id)}
                    disabled={
                      !selectedLease ||
                      revokeLeaseMutation.isPending ||
                      selectedLease.status === "revoked" ||
                      selectedLease.status === "consumed"
                    }
                  >
                    <Ban className="h-3.5 w-3.5" />
                    {revokeLeaseMutation.isPending ? "Revoking..." : "Revoke"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-[11px]"
                    onClick={() => setRunGuideOpen(true)}
                    disabled={!selectedLease}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run Guide
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 p-4 2xl:grid-cols-2">
                {leases.length === 0 ? (
                  <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No dispatch leases yet. Create one above to stage work for an AMX node.
                  </div>
                ) : (
                  leases.slice(0, 6).map((lease) => (
                    <LeaseRow
                      key={lease.id}
                      lease={lease}
                      nodeName={nodeNameById.get(lease.nodeId) ?? "Unknown node"}
                      selected={selectedLease?.id === lease.id}
                      onSelect={() => setSelectedLeaseId(lease.id)}
                    />
                  ))
                )}
              </div>
            </Card>

            <Card className="border-border/70 bg-card/80 p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-primary">
                    <Network className="h-4 w-4" />
                    <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Route Health & Broker</h2>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Device routing is inferred from enrolled node connection modes and heartbeat state.
                  </p>
                </div>
                <Badge variant="outline" className="rounded uppercase">
                  API broker /api
                </Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                {routeHealth.map((route) => (
                  <div
                    key={route.mode}
                    className={cn(
                      "rounded-lg border p-3",
                      route.healthy
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-border/60 bg-background/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          route.healthy ? "bg-emerald-400" : "bg-zinc-500",
                        )}
                      />
                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        {route.online}/{route.total}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-black uppercase tracking-wider">{route.label}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {route.healthy ? "heartbeat live" : route.total > 0 ? "waiting heartbeat" : "no node"}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-border/70 bg-card/80 p-4">
              <div className="mb-4 flex items-center gap-2 text-primary">
                <Route className="h-4 w-4" />
                <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Routing Timeline</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ["Operator intent", "Console validates scope and target"],
                  ["Policy broker", "Risk, budget, trust, MCP context"],
                  ["Node lease", "Signed device consumes one-time token"],
                  ["Evidence return", "Result hash lands in OPPRRC feed"],
                ].map(([title, body], index) => (
                  <div key={title} className="relative rounded-lg border border-border/60 bg-background/60 p-3">
                    <div className="mb-2 flex h-6 w-6 items-center justify-center rounded bg-primary/15 text-xs font-black text-primary">
                      {index + 1}
                    </div>
                    <div className="text-xs font-black uppercase tracking-wider">{title}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{body}</div>
                  </div>
                ))}
              </div>
            </Card>
          </main>

          <aside className="space-y-5 xl:col-span-2 min-[1800px]:col-span-1">
            <Card className="border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-black uppercase tracking-[0.24em] text-primary">
                    Guide Agent
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Use the overlay to coordinate dispatch through Meeting Hub voice, chat, inbox escalation,
                    MCP context, and device-route awareness.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                      Voice / cockpit
                    </div>
                    <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                      Chat / transcript
                    </div>
                    <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                      Inbox escalation
                    </div>
                    <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5">
                      MCP context
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => setGuideAgentOpen(true)}>
                      <HelpCircle className="h-4 w-4" />
                      Overlay
                    </Button>
                    <Button
                      className="gap-2"
                      onClick={() => startDispatchMeetingMutation.mutate()}
                      disabled={startDispatchMeetingMutation.isPending}
                    >
                      <Users className="h-4 w-4" />
                      {startDispatchMeetingMutation.isPending ? "Starting" : "Meet"}
                    </Button>
                  </div>
                  {meetingHub.meetingId ? (
                    <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-100">
                      Meeting Hub active: {meetingHub.meetingTitle || "Dispatch session"} / {meetingHub.status}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>

            <Card className="border-border/70 bg-card/80">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div>
                  <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Evidence & Policy</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">OPPRRC proof after lease execution.</p>
                </div>
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
              </div>
              <div className="max-h-[540px] space-y-3 overflow-y-auto p-4">
                {evidence.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    <FileCheck2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-semibold">No OPPRRC evidence yet.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Run `paperclipai amx-node execute --submit` after a lease is granted.
                    </p>
                  </div>
                ) : (
                  evidence.slice(0, 8).map((entry) => (
                    <EvidenceRow
                      key={entry.id}
                      evidence={entry}
                      nodeName={nodeNameById.get(entry.nodeId) ?? "Unknown node"}
                    />
                  ))
                )}
              </div>
            </Card>

            <Card className="border-border/70 bg-card/80">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div>
                  <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">MCP Context Fabric</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">Servers available to routed agents.</p>
                </div>
                <Plug className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-2 p-4">
                {mcpServers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                    No MCP servers configured. Add or sync MCPs from the MCP Servers page.
                  </div>
                ) : (
                  mcpServers.slice(0, 6).map((server) => (
                    <div
                      key={server.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{server.name}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {server.transportType} / {server.scope}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded uppercase",
                          server.enabled
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
                        )}
                      >
                        {server.enabled ? "enabled" : "off"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="border-border/70 bg-card/80 p-4">
              <div className="flex items-center gap-2 text-primary">
                <TerminalSquare className="h-4 w-4" />
                <h2 className="text-[12px] font-black uppercase tracking-[0.24em]">Node Command</h2>
              </div>
              <div className="mt-3">
                <CommandBlock
                  title="Execute selected lease"
                  command={executeCommand}
                  copied={copiedCommandKey === "execute"}
                  onCopy={() => copyCommand(executeCommand, "Execute command copied", "execute")}
                />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-md border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
                <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                After execution, the node submits OPPRRC evidence and this panel refreshes automatically.
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>

    <Sheet open={guideAgentOpen} onOpenChange={setGuideAgentOpen}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Dispatch Guide Agent
          </SheetTitle>
          <SheetDescription>
            How to run zero-trust dispatch with Meeting Hub, route awareness, MCP context, and full operator communications.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-black uppercase tracking-wider text-primary">
                  Meeting Hub bridge
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Start a Dispatch Ops room when a route, lease, evidence gap, or policy block needs live coordination.
                  The global meeting layer carries voice, chat, cockpit state, transcript, and agent relay context.
                </p>
                {meetingHub.meetingId ? (
                  <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    Active now: {meetingHub.meetingTitle || "Dispatch session"} / {meetingHub.status}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
                <Button
                  className="gap-2"
                  onClick={() => startDispatchMeetingMutation.mutate()}
                  disabled={startDispatchMeetingMutation.isPending}
                >
                  <Users className="h-4 w-4" />
                  {startDispatchMeetingMutation.isPending ? "Starting..." : "Start Dispatch Ops"}
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => openCompanyRoute("/meetings")}>
                  <ExternalLink className="h-4 w-4" />
                  Open Meetings
                </Button>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2 text-primary">
              <Workflow className="h-4 w-4" />
              <h3 className="text-[12px] font-black uppercase tracking-[0.24em]">Operator Flow</h3>
            </div>
            <div className="space-y-2">
              <RunGuideStep
                done={nodes.length > 0}
                active={nodes.length === 0}
                title="1. Enroll or select a trusted device route"
                body="Choose local desktop, laptop, phone, tablet, HMD, edge, container, or cloud VM by trust tier and connection mode."
              />
              <RunGuideStep
                done={enabledMcpServers > 0}
                active={nodes.length > 0 && enabledMcpServers === 0}
                title="2. Attach MCP context before dispatch"
                body="Use MCPs for repo, data, browser, design, cloud, and knowledge context so routed agents know what they may inspect."
              />
              <RunGuideStep
                done={leases.length > 0}
                active={nodes.length > 0 && leases.length === 0}
                title="3. Create a scoped lease"
                body="Pick runtime family, capability, risk, and intent. The lease becomes the one-time contract for work execution."
              />
              <RunGuideStep
                done={evidence.length > 0}
                active={leases.length > 0 && evidence.length === 0}
                title="4. Coordinate and verify"
                body="Use Meeting Hub for live decisions, Inbox for escalations, and OPPRRC evidence for proof after execution."
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2 text-primary">
              <MessageSquare className="h-4 w-4" />
              <h3 className="text-[12px] font-black uppercase tracking-[0.24em]">Communication Options</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <CommunicationOption
                icon={Volume2}
                title="Voice cockpit"
                body="Use Meeting Hub voice for hands-free dispatch, screen context, operator notes, and live agent relay."
                action="Meetings"
                onAction={() => openCompanyRoute("/meetings")}
              />
              <CommunicationOption
                icon={Video}
                title="Video and screen context"
                body="Keep visual state and route decisions attached to the meeting so mobile, tablet, laptop, PC, and HMD operators share the same picture."
                action="Meetings"
                onAction={() => openCompanyRoute("/meetings")}
              />
              <CommunicationOption
                icon={Inbox}
                title="Inbox escalation"
                body="Send failed runs, policy blocks, budget waits, and human approvals to Inbox when work should pause for a decision."
                action="Inbox"
                onAction={() => openCompanyRoute("/inbox")}
              />
              <CommunicationOption
                icon={Plug}
                title="MCP context fabric"
                body="Connect local and cloud tools before assigning work so agents receive authorized context instead of guessing."
                action="MCPs"
                onAction={() => openCompanyRoute("/mcp-servers")}
              />
              <CommunicationOption
                icon={Route}
                title="Route-aware dispatch"
                body="Pick local, cloud, Hugging Face, OpenRouter, Kimi, MiniMax, Claude, Codex, or Gemini based on device health and risk."
              />
              <CommunicationOption
                icon={ShieldCheck}
                title="Evidence and policy"
                body="Close the loop with OPPRRC result hashes, revoked leases, denied leases, and approval-first routing."
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2 text-primary">
              <TerminalSquare className="h-4 w-4" />
              <h3 className="text-[12px] font-black uppercase tracking-[0.24em]">Guide Agent Prompts</h3>
            </div>
            <div className="space-y-2">
              {guideAgentPrompts.map((prompt, index) => (
                <div key={prompt} className="rounded-lg border border-border/60 bg-background/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                        Prompt {index + 1}
                      </div>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{prompt}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 gap-1.5 text-[11px]"
                      onClick={() => copyCommand(prompt, "Guide prompt copied", `guide-prompt-${index}`)}
                    >
                      {copiedCommandKey === `guide-prompt-${index}` ? (
                        <ClipboardCheck className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedCommandKey === `guide-prompt-${index}` ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <Sheet open={runGuideOpen} onOpenChange={setRunGuideOpen}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Run This Lease</SheetTitle>
          <SheetDescription>
            Follow the device-side execution path and watch for returned OPPRRC evidence.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="rounded-lg border border-border/60 bg-card/70 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">
              Selected lease
            </div>
            {selectedLease ? (
              <div className="mt-2 space-y-2">
                <div className="text-sm font-semibold">{selectedLease.commandSummary}</div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={cn("rounded uppercase", riskTone[selectedLease.riskLevel])}>
                    {selectedLease.riskLevel}
                  </Badge>
                  <Badge variant="outline" className="rounded uppercase">
                    {formatLabel(selectedLease.capability)}
                  </Badge>
                  <Badge variant="outline" className="rounded uppercase">
                    {formatLabel(selectedLease.status)}
                  </Badge>
                </div>
                <div className="break-all font-mono text-[11px] text-muted-foreground">{selectedLease.id}</div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">Create or select a lease first.</div>
            )}
          </div>

          <div className="space-y-2">
            <RunGuideStep
              done={Boolean(selectedLease)}
              active={!selectedLease}
              title="1. Create or select a dispatch lease"
              body="The lease scopes a single capability, target node, risk level, and expiry window."
            />
            <RunGuideStep
              done={Boolean(createdLeaseToken)}
              active={Boolean(selectedLease) && !createdLeaseToken}
              title="2. Capture the one-time token"
              body="Tokens are only shown when the console creates a lease. Existing leases must use the token captured at creation."
            />
            <RunGuideStep
              done={Boolean(selectedLease && createdLeaseToken)}
              active={Boolean(selectedLease && !selectedLeaseEvidence)}
              title="3. Run the node command"
              body="Execute from the enrolled device. The node consumes the lease, runs local policy checks, and submits evidence."
            />
            <RunGuideStep
              done={Boolean(selectedLeaseEvidence)}
              active={Boolean(selectedLease && createdLeaseToken && !selectedLeaseEvidence)}
              title="4. Evidence received"
              body="A matching OPPRRC evidence record with a result hash confirms the execution returned to the control plane."
            />
          </div>

          <CommandBlock
            title="Poll assigned work"
            command={pollCommand}
            copied={copiedCommandKey === "poll"}
            onCopy={() => copyCommand(pollCommand, "Poll command copied", "poll")}
          />

          <CommandBlock
            title="Execute and submit evidence"
            command={executeCommand}
            copied={copiedCommandKey === "execute"}
            onCopy={() => copyCommand(executeCommand, "Execute command copied", "execute")}
          />

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                leasesQuery.refetch();
                evidenceQuery.refetch();
              }}
            >
              <RefreshCw className={cn("h-4 w-4", (leasesQuery.isFetching || evidenceQuery.isFetching) && "animate-spin")} />
              Refresh
            </Button>
            <Button
              className="gap-2"
              onClick={() => copyCommand(executeCommand, "Execute command copied", "execute")}
              disabled={!selectedLease}
            >
              <TerminalSquare className="h-4 w-4" />
              Copy Execute
            </Button>
          </div>

          {selectedLeaseEvidence ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <FileCheck2 className="h-4 w-4" />
                Evidence received
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Received {formatTime(selectedLeaseEvidence.receivedAt)}
              </div>
              <div className="mt-2 rounded border border-emerald-500/20 bg-background/60 px-2 py-1 font-mono text-[10px] text-emerald-200">
                {selectedLeaseEvidence.resultSha256}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              Waiting for matching evidence on the selected lease.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}

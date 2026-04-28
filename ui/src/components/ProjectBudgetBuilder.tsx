/**
 * ProjectBudgetBuilder — Full-scope budget management for AMX Air Hubs
 *
 * Panels:
 *  1. Overview     — policy cap + live burn + status signals
 *  2. Line Items   — itemized CRUD per phase (Pre / Production / Post)
 *  3. Tokens       — agent credit burn rates + depletion forecasts
 *  4. Work Orders  — issues as tracked work orders with AMX Chain refs
 *  5. AMX Chain    — immutable ledger per company / project
 *  6. Sponsor View — public read-only spend breakdown
 */

import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
} from "react";
import type { BudgetPolicySummary } from "@paperclipai/shared";
import type { Issue } from "@paperclipai/shared";
import {
  Wallet,
  ShieldAlert,
  AlertTriangle,
  PlusCircle,
  Trash2,
  CheckCircle2,
  Link2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Zap,
  TrendingUp,
  TrendingDown,
  Hash,
  Lock,
  Unlock,
  FileText,
  BarChart3,
  ArrowUpRight,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { BudgetPolicyCard } from "./BudgetPolicyCard";
import { cn, formatCents } from "../lib/utils";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

type Phase = "pre" | "production" | "post";
type LineStatus = "planned" | "approved" | "invoiced" | "spent";

interface LineItem {
  id: string;
  phase: Phase;
  category: string;
  description: string;
  estimated: number; // cents
  actual: number;    // cents
  status: LineStatus;
  chainRef: string;
  issueId?: string;
  date: string;
}

interface ChainTx {
  hash: string;
  ref: string;
  phase: Phase;
  description: string;
  amount: number;
  type: "debit" | "credit";
  visibility: "public" | "private";
  timestamp: string;
  lineItemId: string;
}

interface ChainData {
  companyId: string;
  projectId: string;
  chainId: string;
  isPublic: boolean;
  transactions: ChainTx[];
}

type BudgetTab = "overview" | "lineitems" | "tokens" | "workorders" | "chain" | "sponsor";

const PHASES: { id: Phase; label: string; color: string }[] = [
  { id: "pre",        label: "Pre-Production", color: "text-blue-400"   },
  { id: "production", label: "Production",     color: "text-amber-400"  },
  { id: "post",       label: "Post",           color: "text-green-400"  },
];

const CATEGORIES = [
  "Personnel", "Equipment", "Software", "Services",
  "Marketing", "Travel", "Facilities", "Other",
];

const LINE_STATUSES: { id: LineStatus; label: string; color: string }[] = [
  { id: "planned",  label: "Planned",  color: "text-slate-400"  },
  { id: "approved", label: "Approved", color: "text-blue-400"   },
  { id: "invoiced", label: "Invoiced", color: "text-amber-400"  },
  { id: "spent",    label: "Spent",    color: "text-green-400"  },
];

const BUDGET_TABS: { id: BudgetTab; label: string; icon: typeof Wallet }[] = [
  { id: "overview",   label: "Overview",     icon: BarChart3    },
  { id: "lineitems",  label: "Line Items",   icon: FileText     },
  { id: "tokens",     label: "Tokens",       icon: Zap          },
  { id: "workorders", label: "Work Orders",  icon: Hash         },
  { id: "chain",      label: "AMX Chain",    icon: Link2        },
  { id: "sponsor",    label: "Sponsor View", icon: Eye          },
];

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Storage helpers                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

function storageKey(companyId: string, projectId: string) {
  return `amx:budget:${companyId}:${projectId}`;
}
function chainKey(companyId: string, projectId: string) {
  return `amx:chain:${companyId}:${projectId}`;
}

function loadLines(companyId: string, projectId: string): LineItem[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(companyId, projectId)) ?? "[]");
  } catch { return []; }
}
function saveLines(companyId: string, projectId: string, lines: LineItem[]) {
  localStorage.setItem(storageKey(companyId, projectId), JSON.stringify(lines));
}

function loadChain(companyId: string, projectId: string, prefix: string): ChainData {
  try {
    const raw = localStorage.getItem(chainKey(companyId, projectId));
    if (raw) return JSON.parse(raw) as ChainData;
  } catch { /* */ }
  return {
    companyId,
    projectId,
    chainId: `${prefix}-CHAIN-${projectId.slice(0, 8).toUpperCase()}`,
    isPublic: false,
    transactions: [],
  };
}
function saveChain(companyId: string, projectId: string, chain: ChainData) {
  localStorage.setItem(chainKey(companyId, projectId), JSON.stringify(chain));
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function genChainRef(prefix: string) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-WO-${ts}${rand}`;
}

function genTxHash() {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

function parseDollar(v: string): number {
  const n = parseFloat(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fmtDollar(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function burnRateDaysLeft(observed: number, amount: number, daysRunning: number): number | null {
  if (amount <= 0 || observed <= 0 || daysRunning <= 0) return null;
  const dailyRate = observed / daysRunning;
  const remaining = amount - observed;
  if (dailyRate <= 0) return null;
  return Math.ceil(remaining / dailyRate);
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Animated status signal                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function StatusSignal({ status }: { status: BudgetPolicySummary["status"] }) {
  const color =
    status === "hard_stop" ? "bg-red-500" :
    status === "warning"   ? "bg-amber-400" :
    "bg-emerald-400";
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", color)} />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Copy button                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  1. Overview panel                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

function OverviewPanel({
  summary,
  lines,
  isSaving,
  onSave,
}: {
  summary: BudgetPolicySummary;
  lines: LineItem[];
  isSaving?: boolean;
  onSave?: (cents: number) => void;
}) {
  const totalEst  = lines.reduce((a, l) => a + l.estimated, 0);
  const totalAct  = lines.reduce((a, l) => a + l.actual, 0);
  const preEst    = lines.filter(l => l.phase === "pre").reduce((a, l) => a + l.estimated, 0);
  const prodEst   = lines.filter(l => l.phase === "production").reduce((a, l) => a + l.estimated, 0);
  const postEst   = lines.filter(l => l.phase === "post").reduce((a, l) => a + l.estimated, 0);
  const variance  = totalEst - totalAct;

  return (
    <div className="space-y-6">
      {/* API Budget Card */}
      <BudgetPolicyCard summary={summary} variant="plain" isSaving={isSaving} onSave={onSave} />

      {/* Itemized totals */}
      {lines.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border/40" />
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Itemized Budget</span>
            <div className="h-px flex-1 bg-border/40" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Estimated", val: totalEst,  color: "text-foreground" },
              { label: "Total Actual",    val: totalAct,  color: totalAct > totalEst ? "text-red-400" : "text-green-400" },
              { label: "Variance",        val: Math.abs(variance), color: variance >= 0 ? "text-emerald-400" : "text-red-400", prefix: variance >= 0 ? "▲ " : "▼ " },
              { label: "Items",           val: null, display: String(lines.length) + " line" + (lines.length !== 1 ? "s" : ""), color: "text-foreground" },
            ].map(({ label, val, display, color, prefix }) => (
              <div key={label} className="rounded-xl border border-border/50 bg-card px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
                <div className={cn("text-lg font-bold tabular-nums", color)}>
                  {display ?? `${prefix ?? ""}${fmtDollar(val!)}`}
                </div>
              </div>
            ))}
          </div>

          {/* Phase breakdown bar */}
          {totalEst > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Phase Breakdown</div>
              <div className="h-3 rounded-full overflow-hidden flex">
                {[
                  { val: preEst,  color: "bg-blue-500"  },
                  { val: prodEst, color: "bg-amber-500" },
                  { val: postEst, color: "bg-green-500" },
                ].map(({ val, color }, i) => (
                  <div
                    key={i}
                    className={cn("h-full transition-all duration-500", color)}
                    style={{ width: `${(val / totalEst) * 100}%` }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-4 text-xs">
                {[
                  { label: "Pre", val: preEst,  color: "bg-blue-500"  },
                  { label: "Prod", val: prodEst, color: "bg-amber-500" },
                  { label: "Post", val: postEst, color: "bg-green-500" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", color)} />
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium tabular-nums">{fmtDollar(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  2. Line Items panel                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

function LineItemRow({
  item,
  companyPrefix,
  onUpdate,
  onDelete,
}: {
  item: LineItem;
  companyPrefix: string;
  onUpdate: (id: string, patch: Partial<LineItem>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...item });

  const save = () => { onUpdate(item.id, draft); setEditing(false); };
  const statusConf = LINE_STATUSES.find(s => s.id === item.status) ?? LINE_STATUSES[0]!;

  if (editing) {
    return (
      <tr className="border-b border-border/30 bg-muted/20">
        <td className="px-3 py-2">
          <select
            value={draft.phase}
            onChange={e => setDraft(d => ({ ...d, phase: e.target.value as Phase }))}
            className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1"
          >
            {PHASES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <select
            value={draft.category}
            onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
            className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <input
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1"
            placeholder="Description"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            value={(draft.estimated / 100).toFixed(2)}
            onChange={e => setDraft(d => ({ ...d, estimated: parseDollar(e.target.value) }))}
            className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1 tabular-nums"
            min={0} step={0.01}
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            value={(draft.actual / 100).toFixed(2)}
            onChange={e => setDraft(d => ({ ...d, actual: parseDollar(e.target.value) }))}
            className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1 tabular-nums"
            min={0} step={0.01}
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={draft.status}
            onChange={e => setDraft(d => ({ ...d, status: e.target.value as LineStatus }))}
            className="w-full text-xs bg-background border border-border/60 rounded px-2 py-1"
          >
            {LINE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <button onClick={save} className="text-green-400 hover:text-green-300 p-1 rounded hover:bg-green-400/10 transition-colors"><CheckCircle2 className="h-4 w-4" /></button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50 transition-colors text-xs">✕</button>
          </div>
        </td>
      </tr>
    );
  }

  const phaseConf = PHASES.find(p => p.id === item.phase) ?? PHASES[0]!;
  const over = item.actual > item.estimated && item.actual > 0;

  return (
    <tr
      className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer group"
      onClick={() => setEditing(true)}
    >
      <td className="px-3 py-2">
        <span className={cn("text-[11px] font-semibold", phaseConf.color)}>{phaseConf.label}</span>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{item.category}</td>
      <td className="px-3 py-2 text-xs text-foreground/90 max-w-[200px] truncate">{item.description}</td>
      <td className="px-3 py-2 text-xs tabular-nums font-medium">{fmtDollar(item.estimated)}</td>
      <td className={cn("px-3 py-2 text-xs tabular-nums font-medium", over ? "text-red-400" : "text-foreground/80")}>
        {item.actual > 0 ? fmtDollar(item.actual) : "—"}
      </td>
      <td className="px-3 py-2">
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", statusConf.color)}>{statusConf.label}</span>
      </td>
      <td className="px-3 py-2 text-[10px] font-mono text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
        <div className="flex items-center gap-1">
          <span className="truncate max-w-[80px]">{item.chainRef}</span>
          <CopyBtn text={item.chainRef} />
          <button
            onClick={e => { e.stopPropagation(); onDelete(item.id); }}
            className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all ml-1 p-0.5 rounded"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function LineItemsPanel({
  lines,
  companyPrefix,
  onAdd,
  onUpdate,
  onDelete,
}: {
  lines: LineItem[];
  companyPrefix: string;
  onAdd: (item: LineItem) => void;
  onUpdate: (id: string, patch: Partial<LineItem>) => void;
  onDelete: (id: string) => void;
}) {
  const [phaseFilter, setPhaseFilter] = useState<Phase | "all">("all");
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState<Omit<LineItem, "id" | "chainRef">>({
    phase: "production",
    category: "Personnel",
    description: "",
    estimated: 0,
    actual: 0,
    status: "planned",
    date: new Date().toISOString().slice(0, 10),
  });

  const visible = phaseFilter === "all" ? lines : lines.filter(l => l.phase === phaseFilter);

  const totalEst = visible.reduce((a, l) => a + l.estimated, 0);
  const totalAct = visible.reduce((a, l) => a + l.actual, 0);

  const handleAdd = () => {
    if (!newItem.description.trim()) return;
    onAdd({
      ...newItem,
      id: genId(),
      chainRef: genChainRef(companyPrefix),
    });
    setNewItem(prev => ({ ...prev, description: "", estimated: 0, actual: 0, status: "planned" }));
    setAdding(false);
  };

  return (
    <div className="space-y-4">
      {/* Phase filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setPhaseFilter("all")}
          className={cn("text-xs px-3 py-1 rounded-full border font-medium transition-colors",
            phaseFilter === "all" ? "bg-primary/20 text-primary border-primary/40" : "border-border/50 text-muted-foreground hover:border-border")}
        >
          All ({lines.length})
        </button>
        {PHASES.map(p => {
          const cnt = lines.filter(l => l.phase === p.id).length;
          return (
            <button
              key={p.id}
              onClick={() => setPhaseFilter(p.id)}
              className={cn("text-xs px-3 py-1 rounded-full border font-medium transition-colors",
                phaseFilter === p.id ? cn("bg-primary/20 text-primary border-primary/40") : "border-border/50 text-muted-foreground hover:border-border")}
            >
              {p.label} ({cnt})
            </button>
          );
        })}
        <div className="ml-auto">
          <button
            onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Line Item
          </button>
        </div>
      </div>

      {/* Add row */}
      {adding && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Line Item</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Phase</label>
              <select
                value={newItem.phase}
                onChange={e => setNewItem(d => ({ ...d, phase: e.target.value as Phase }))}
                className="mt-1 w-full text-xs bg-background border border-border/60 rounded-md px-2 py-1.5"
              >
                {PHASES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</label>
              <select
                value={newItem.category}
                onChange={e => setNewItem(d => ({ ...d, category: e.target.value }))}
                className="mt-1 w-full text-xs bg-background border border-border/60 rounded-md px-2 py-1.5"
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
              <select
                value={newItem.status}
                onChange={e => setNewItem(d => ({ ...d, status: e.target.value as LineStatus }))}
                className="mt-1 w-full text-xs bg-background border border-border/60 rounded-md px-2 py-1.5"
              >
                {LINE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
              <input
                value={newItem.description}
                onChange={e => setNewItem(d => ({ ...d, description: e.target.value }))}
                className="mt-1 w-full text-sm bg-background border border-border/60 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="What is this line item for?"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimated ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={(newItem.estimated / 100).toFixed(2)}
                onChange={e => setNewItem(d => ({ ...d, estimated: parseDollar(e.target.value) }))}
                className="mt-1 w-full text-sm bg-background border border-border/60 rounded-md px-3 py-1.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Actual ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={(newItem.actual / 100).toFixed(2)}
                onChange={e => setNewItem(d => ({ ...d, actual: parseDollar(e.target.value) }))}
                className="mt-1 w-full text-sm bg-background border border-border/60 rounded-md px-3 py-1.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAdd}
              disabled={!newItem.description.trim()}
              className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
            >
              Add Item
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-border/60 text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {visible.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {["Phase", "Category", "Description", "Estimated", "Actual", "Status", "Chain Ref"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(item => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  companyPrefix={companyPrefix}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
              <tr className="border-t border-border/50 bg-muted/20">
                <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-muted-foreground">Totals</td>
                <td className="px-3 py-2 text-xs font-bold tabular-nums">{fmtDollar(totalEst)}</td>
                <td className={cn("px-3 py-2 text-xs font-bold tabular-nums", totalAct > totalEst ? "text-red-400" : "text-green-400")}>
                  {totalAct > 0 ? fmtDollar(totalAct) : "—"}
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-border/50 rounded-xl">
          <FileText className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">No line items yet. Click <strong>Add Line Item</strong> to start.</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  3. Tokens & Credits panel                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

interface AgentBudgetRow {
  name: string;
  observed: number;
  amount: number;
  utilizationPercent: number;
  status: string;
  scopeType: string;
}

function TokensPanel({ policies }: { policies: AgentBudgetRow[] }) {
  const agentPolicies = policies.filter(p => p.scopeType === "agent");
  const today = new Date();
  const dayOfMonth = today.getDate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-semibold">Agent Credit & Token Usage</span>
      </div>

      {agentPolicies.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border/50 rounded-xl">
          No agent budget policies configured.
        </div>
      ) : (
        <div className="space-y-4">
          {agentPolicies.map(agent => {
            const pct = Math.min(100, agent.utilizationPercent);
            const daysLeft = burnRateDaysLeft(agent.observed, agent.amount, dayOfMonth);
            const barColor =
              pct >= 90 ? "bg-red-500" :
              pct >= 75 ? "bg-amber-400" :
              "bg-emerald-400";
            const StatusIcon = pct >= 90 ? ShieldAlert : pct >= 75 ? AlertTriangle : Wallet;

            return (
              <div key={agent.name} className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusIcon className={cn("h-4 w-4", pct >= 90 ? "text-red-400" : pct >= 75 ? "text-amber-400" : "text-emerald-400")} />
                      <span className="text-sm font-semibold">{agent.name}</span>
                      <StatusSignal status={agent.status as BudgetPolicySummary["status"]} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatCents(agent.observed)} spent of {formatCents(agent.amount)} cap
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-xl font-bold tabular-nums", pct >= 90 ? "text-red-400" : pct >= 75 ? "text-amber-400" : "text-emerald-400")}>
                      {pct.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">utilized</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", barColor)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Spent",     val: formatCents(agent.observed) },
                    { label: "Remaining", val: formatCents(Math.max(0, agent.amount - agent.observed)) },
                    { label: "Est. Days Left", val: daysLeft !== null ? `~${daysLeft}d` : "∞" },
                  ].map(({ label, val }) => (
                    <div key={label} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                      <div className="text-sm font-bold tabular-nums mt-0.5">{val}</div>
                    </div>
                  ))}
                </div>

                {/* Burn rate indicator */}
                {agent.observed > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
                    <span>
                      Avg daily burn: <span className="font-semibold text-foreground/80">{formatCents(Math.round(agent.observed / Math.max(1, dayOfMonth)))}/day</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Token legend */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Credit Tiers</div>
        {[
          { label: "Green — Healthy",  range: "0–74%",   color: "bg-emerald-400" },
          { label: "Amber — Warning",  range: "75–89%",  color: "bg-amber-400"   },
          { label: "Red — Hard Stop",  range: "90–100%", color: "bg-red-500"     },
        ].map(({ label, range, color }) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
              <span>{label}</span>
            </div>
            <span className="text-muted-foreground tabular-nums">{range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  4. Work Orders panel                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

function WorkOrdersPanel({
  issues,
  lines,
  companyPrefix,
}: {
  issues: Issue[];
  lines: LineItem[];
  companyPrefix: string;
}) {
  // Map issues to work orders using their chain ref from line items
  const linesByIssue = useMemo(() => {
    const map = new Map<string, LineItem[]>();
    for (const l of lines) {
      if (l.issueId) {
        if (!map.has(l.issueId)) map.set(l.issueId, []);
        map.get(l.issueId)!.push(l);
      }
    }
    return map;
  }, [lines]);

  const activeIssues = issues.filter(i =>
    !["done", "cancelled"].includes(i.status)
  ).slice(0, 20);

  const doneIssues = issues.filter(i =>
    ["done"].includes(i.status)
  ).slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Hash className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Work Orders — AMX Chain Tracked</span>
        <span className="ml-auto text-xs text-muted-foreground">{issues.length} total</span>
      </div>

      {/* Active work orders */}
      {activeIssues.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active</div>
          <div className="space-y-1.5">
            {activeIssues.map(issue => {
              const woRef = `${companyPrefix}-WO-${issue.issueNumber ?? issue.id.slice(0, 6).toUpperCase()}`;
              const issueLines = linesByIssue.get(issue.id) ?? [];
              const totalEst = issueLines.reduce((a, l) => a + l.estimated, 0);
              return (
                <div key={issue.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-card px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">{issue.identifier ?? woRef}</span>
                      <span className="truncate text-xs font-medium">{issue.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {totalEst > 0 && (
                      <span className="text-[10px] text-amber-400 tabular-nums">{fmtDollar(totalEst)}</span>
                    )}
                    <span className="font-mono text-[10px] text-muted-foreground/60 hidden sm:block">{woRef}</span>
                    <span className={cn("text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded",
                      issue.status === "in_progress" ? "bg-amber-400/10 text-amber-400" :
                      issue.status === "blocked"     ? "bg-red-400/10 text-red-400" :
                      "bg-blue-400/10 text-blue-400"
                    )}>
                      {issue.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed work orders */}
      {doneIssues.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Completed</div>
          <div className="space-y-1">
            {doneIssues.map(issue => {
              const woRef = `${companyPrefix}-WO-${issue.issueNumber ?? issue.id.slice(0, 6).toUpperCase()}`;
              return (
                <div key={issue.id} className="flex items-center gap-3 rounded-lg border border-border/20 px-3 py-2 text-sm opacity-60 hover:opacity-90 transition-opacity">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{issue.identifier}</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground">{issue.title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/60 hidden sm:block">{woRef}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {issues.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border/50 rounded-xl">
          No issues found for this project.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  5. AMX Chain panel                                                          */
/* ─────────────────────────────────────────────────────────────────────────── */

function ChainPanel({
  chain,
  companyPrefix,
  projectName,
  lines,
  onTogglePublic,
  onAddTx,
}: {
  chain: ChainData;
  companyPrefix: string;
  projectName: string;
  lines: LineItem[];
  onTogglePublic: () => void;
  onAddTx: (tx: ChainTx) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [txDraft, setTxDraft] = useState({
    description: "",
    amount: "",
    phase: "production" as Phase,
    type: "debit" as "debit" | "credit",
    visibility: "public" as "public" | "private",
  });

  const handleAddTx = () => {
    if (!txDraft.description.trim()) return;
    onAddTx({
      hash: genTxHash(),
      ref: genChainRef(companyPrefix),
      phase: txDraft.phase,
      description: txDraft.description,
      amount: parseDollar(txDraft.amount),
      type: txDraft.type,
      visibility: txDraft.visibility,
      timestamp: new Date().toISOString(),
      lineItemId: "",
    });
    setTxDraft({ description: "", amount: "", phase: "production", type: "debit", visibility: "public" });
    setShowForm(false);
  };

  const totalDebit  = chain.transactions.filter(t => t.type === "debit").reduce((a, t) => a + t.amount, 0);
  const totalCredit = chain.transactions.filter(t => t.type === "credit").reduce((a, t) => a + t.amount, 0);
  const netBalance  = totalCredit - totalDebit;

  // Auto-generate transactions from line items that are "spent"
  const lineItemTxIds = new Set(chain.transactions.map(t => t.lineItemId).filter(Boolean));
  const pendingFromLines = lines.filter(l => l.status === "spent" && l.actual > 0 && !lineItemTxIds.has(l.id));

  return (
    <div className="space-y-5">
      {/* Chain header */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">AMX Chain ID</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">{chain.chainId}</span>
              <CopyBtn text={chain.chainId} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">{projectName} · {chain.transactions.length} transactions</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={onTogglePublic}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
                chain.isPublic
                  ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                  : "border-border/50 text-muted-foreground hover:bg-muted/50"
              )}
            >
              {chain.isPublic ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {chain.isPublic ? "Public Chain" : "Private Chain"}
            </button>
          </div>
        </div>

        {/* Balance row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Debits",  val: fmtDollar(totalDebit),  color: "text-red-400"   },
            { label: "Total Credits", val: fmtDollar(totalCredit), color: "text-green-400" },
            { label: "Net Balance",   val: fmtDollar(Math.abs(netBalance)), color: netBalance >= 0 ? "text-green-400" : "text-red-400", prefix: netBalance >= 0 ? "+" : "-" },
          ].map(({ label, val, color, prefix }) => (
            <div key={label} className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className={cn("text-sm font-bold tabular-nums mt-0.5", color)}>{prefix}{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending auto-sync from line items */}
      {pendingFromLines.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-300">
              {pendingFromLines.length} spent line item{pendingFromLines.length !== 1 ? "s" : ""} not yet on chain
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Record these transactions to keep the ledger in sync.</p>
          </div>
          <button
            onClick={() => {
              pendingFromLines.forEach(l => {
                onAddTx({
                  hash: genTxHash(),
                  ref: l.chainRef,
                  phase: l.phase,
                  description: l.description,
                  amount: l.actual,
                  type: "debit",
                  visibility: "public",
                  timestamp: new Date().toISOString(),
                  lineItemId: l.id,
                });
              });
            }}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors font-medium shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Sync All
          </button>
        </div>
      )}

      {/* Add transaction */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transaction Ledger</div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-colors"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Add Transaction
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
              <input
                value={txDraft.description}
                onChange={e => setTxDraft(d => ({ ...d, description: e.target.value }))}
                className="mt-1 w-full text-sm bg-background border border-border/60 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="What is this transaction for?"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={txDraft.amount}
                onChange={e => setTxDraft(d => ({ ...d, amount: e.target.value }))}
                className="mt-1 w-full text-sm bg-background border border-border/60 rounded-md px-3 py-1.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Phase</label>
              <select
                value={txDraft.phase}
                onChange={e => setTxDraft(d => ({ ...d, phase: e.target.value as Phase }))}
                className="mt-1 w-full text-sm bg-background border border-border/60 rounded-md px-3 py-1.5"
              >
                {PHASES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</label>
              <select
                value={txDraft.type}
                onChange={e => setTxDraft(d => ({ ...d, type: e.target.value as "debit" | "credit" }))}
                className="mt-1 w-full text-sm bg-background border border-border/60 rounded-md px-3 py-1.5"
              >
                <option value="debit">Debit (Spend)</option>
                <option value="credit">Credit (Income)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Visibility</label>
              <select
                value={txDraft.visibility}
                onChange={e => setTxDraft(d => ({ ...d, visibility: e.target.value as "public" | "private" }))}
                className="mt-1 w-full text-sm bg-background border border-border/60 rounded-md px-3 py-1.5"
              >
                <option value="public">Public (Sponsor visible)</option>
                <option value="private">Private (Internal only)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddTx}
              disabled={!txDraft.description.trim()}
              className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium disabled:opacity-50 transition-colors"
            >
              Record Transaction
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs px-3 py-1.5 rounded-md border border-border/60 text-muted-foreground hover:bg-muted/50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ledger */}
      {chain.transactions.length > 0 ? (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {["Hash", "Ref", "Phase", "Description", "Amount", "Type", "Vis.", "Time"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...chain.transactions].reverse().map(tx => (
                <tr key={tx.hash} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-mono text-muted-foreground/60">
                    <div className="flex items-center gap-1">
                      <span>{tx.hash.slice(0, 8)}</span>
                      <CopyBtn text={tx.hash} />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground/80">{tx.ref.split("-").slice(-1)[0]}</td>
                  <td className="px-3 py-2">
                    <span className={cn("font-semibold", PHASES.find(p => p.id === tx.phase)?.color ?? "text-muted-foreground")}>
                      {PHASES.find(p => p.id === tx.phase)?.label?.slice(0, 4) ?? tx.phase}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[140px] truncate text-foreground/80">{tx.description}</td>
                  <td className={cn("px-3 py-2 font-bold tabular-nums", tx.type === "debit" ? "text-red-400" : "text-green-400")}>
                    {tx.type === "debit" ? "-" : "+"}{fmtDollar(tx.amount)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn("text-[10px] font-semibold uppercase", tx.type === "debit" ? "text-red-400" : "text-green-400")}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {tx.visibility === "public"
                      ? <Unlock className="h-3 w-3 text-green-400" />
                      : <Lock className="h-3 w-3 text-muted-foreground/60" />
                    }
                  </td>
                  <td className="px-3 py-2 text-muted-foreground/60 tabular-nums">
                    {new Date(tx.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border/50 rounded-xl">
          <Link2 className="h-7 w-7 mx-auto mb-2 opacity-30" />
          No transactions recorded on this chain yet.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  6. Sponsor View panel                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function SponsorViewPanel({
  chain,
  lines,
  projectName,
  companyPrefix,
}: {
  chain: ChainData;
  lines: LineItem[];
  projectName: string;
  companyPrefix: string;
}) {
  const publicTxs = chain.transactions.filter(t => t.visibility === "public");
  const publicSpend = publicTxs.filter(t => t.type === "debit").reduce((a, t) => a + t.amount, 0);
  const publicCredit = publicTxs.filter(t => t.type === "credit").reduce((a, t) => a + t.amount, 0);

  const byPhase = useMemo(() => {
    const map: Record<Phase, number> = { pre: 0, production: 0, post: 0 };
    for (const tx of publicTxs) {
      if (tx.type === "debit") map[tx.phase] = (map[tx.phase] ?? 0) + tx.amount;
    }
    return map;
  }, [publicTxs]);

  const totalEst = lines.reduce((a, l) => a + l.estimated, 0);

  return (
    <div className="space-y-6">
      {/* Sponsor header */}
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
        <div className="flex items-start gap-3">
          <Eye className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-green-300">Sponsor Transparency View</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {chain.isPublic ? (
                <>Chain <span className="font-mono text-primary">{chain.chainId}</span> is <span className="text-green-400 font-medium">public</span>. Sponsors can verify all public transactions on-chain.</>
              ) : (
                <>Chain is <span className="text-amber-400 font-medium">private</span>. Enable public chain in the AMX Chain tab for sponsor access.</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Project",        val: projectName,             isText: true },
          { label: "Total Budget",   val: fmtDollar(totalEst),     isText: true },
          { label: "Public Spend",   val: fmtDollar(publicSpend),  isText: true },
          { label: "Public Credits", val: fmtDollar(publicCredit), isText: true },
          { label: "Net Spend",      val: fmtDollar(publicSpend - publicCredit), isText: true },
          { label: "Chain ID",       val: chain.chainId, isText: true, mono: true },
        ].map(({ label, val, mono }) => (
          <div key={label} className="rounded-xl border border-border/50 bg-card px-4 py-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
            <div className={cn("text-sm font-bold truncate", mono ? "font-mono text-primary text-xs" : "text-foreground")}>{val}</div>
          </div>
        ))}
      </div>

      {/* Phase breakdown */}
      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spend by Phase</div>
        {PHASES.map(phase => {
          const spent = byPhase[phase.id] ?? 0;
          const maxSpend = Math.max(1, publicSpend);
          return (
            <div key={phase.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={cn("font-semibold", phase.color)}>{phase.label}</span>
                <span className="tabular-nums font-medium">{fmtDollar(spent)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(spent / maxSpend) * 100}%`,
                    background: phase.id === "pre" ? "#3b82f6" : phase.id === "production" ? "#f59e0b" : "#22c55e",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Public transactions */}
      {publicTxs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Public Transactions</div>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  {["Ref", "Phase", "Description", "Amount", "Date"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...publicTxs].reverse().map(tx => (
                  <tr key={tx.hash} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-muted-foreground/80">{tx.ref.split("-").slice(-1)[0]}</td>
                    <td className="px-3 py-2">
                      <span className={cn("font-semibold text-[10px]", PHASES.find(p => p.id === tx.phase)?.color)}>
                        {PHASES.find(p => p.id === tx.phase)?.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-foreground/80 max-w-[160px] truncate">{tx.description}</td>
                    <td className={cn("px-3 py-2 font-bold tabular-nums", tx.type === "debit" ? "text-red-400" : "text-green-400")}>
                      {tx.type === "debit" ? "-" : "+"}{fmtDollar(tx.amount)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground/60 tabular-nums">
                      {new Date(tx.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {publicTxs.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border/50 rounded-xl">
          No public transactions on this chain yet. Add transactions with <strong>Public</strong> visibility in the AMX Chain tab.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Root component                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

export function ProjectBudgetBuilder({
  summary,
  isSaving,
  onSave,
  issues = [],
  companyId,
  projectId,
  projectName = "Project",
  companyPrefix = "AMXA",
  budgetPolicies = [],
}: {
  summary: BudgetPolicySummary;
  isSaving?: boolean;
  onSave?: (cents: number) => void;
  issues?: Issue[];
  companyId: string;
  projectId: string;
  projectName?: string;
  companyPrefix?: string;
  budgetPolicies?: AgentBudgetRow[];
}) {
  const [activeTab, setActiveTab] = useState<BudgetTab>("overview");
  const [lines, setLines] = useState<LineItem[]>(() => loadLines(companyId, projectId));
  const [chain, setChain] = useState<ChainData>(() => loadChain(companyId, projectId, companyPrefix));

  // Persist on change
  useEffect(() => { saveLines(companyId, projectId, lines); }, [companyId, projectId, lines]);
  useEffect(() => { saveChain(companyId, projectId, chain); }, [companyId, projectId, chain]);

  const addLine = useCallback((item: LineItem) => setLines(prev => [...prev, item]), []);
  const updateLine = useCallback((id: string, patch: Partial<LineItem>) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l)), []);
  const deleteLine = useCallback((id: string) => setLines(prev => prev.filter(l => l.id !== id)), []);

  const togglePublic = useCallback(() =>
    setChain(prev => ({ ...prev, isPublic: !prev.isPublic })), []);
  const addTx = useCallback((tx: ChainTx) =>
    setChain(prev => ({ ...prev, transactions: [...prev.transactions, tx] })), []);

  // Status signal
  const chainPending = lines.filter(l => l.status === "spent" && l.actual > 0 &&
    !chain.transactions.some(t => t.lineItemId === l.id)).length;

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-auto-hide pb-px border-b border-border/40">
        {BUDGET_TABS.map(tab => {
          const Icon = tab.icon;
          const hasBadge = tab.id === "chain" && chainPending > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap rounded-t-md transition-colors relative",
                activeTab === tab.id
                  ? "text-foreground border-b-2 border-primary -mb-px bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {hasBadge && (
                <span className="h-4 w-4 rounded-full bg-amber-500 text-[9px] font-bold text-black flex items-center justify-center">
                  {chainPending}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      {activeTab === "overview" && (
        <OverviewPanel summary={summary} lines={lines} isSaving={isSaving} onSave={onSave} />
      )}
      {activeTab === "lineitems" && (
        <LineItemsPanel
          lines={lines}
          companyPrefix={companyPrefix}
          onAdd={addLine}
          onUpdate={updateLine}
          onDelete={deleteLine}
        />
      )}
      {activeTab === "tokens" && (
        <TokensPanel policies={budgetPolicies} />
      )}
      {activeTab === "workorders" && (
        <WorkOrdersPanel issues={issues} lines={lines} companyPrefix={companyPrefix} />
      )}
      {activeTab === "chain" && (
        <ChainPanel
          chain={chain}
          companyPrefix={companyPrefix}
          projectName={projectName}
          lines={lines}
          onTogglePublic={togglePublic}
          onAddTx={addTx}
        />
      )}
      {activeTab === "sponsor" && (
        <SponsorViewPanel
          chain={chain}
          lines={lines}
          projectName={projectName}
          companyPrefix={companyPrefix}
        />
      )}
    </div>
  );
}

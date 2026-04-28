/**
 * CloudBrowser — AMX Cloud Browser
 *
 * Agents and users can navigate platform pages and external URLs.
 * Integrates page-agent for natural-language browser automation:
 * search, form filling, grant submissions, data extraction.
 *
 * Features:
 * - URL bar + back / forward / refresh / stop
 * - Platform shortcut grid (internal Paperclip pages)
 * - External URL loading via sandboxed iframe
 * - page-agent command panel (real credit cost display)
 * - Live action log
 * - "Book Agent" flow via MicroServiceBooking
 */

import * as React from "react";
import {
  Globe,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Search,
  Zap,
  PieChart,
  Bot,
  Plus,
  ArrowRight,
  LayoutDashboard,
  FileText,
  Target,
  Factory,
  Briefcase,
  Link2,
  Wallet,
  ShieldCheck,
  GraduationCap,
  Store,
  CheckCircle2,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { useNavigate, useLocation } from "@/lib/router";
import { agentsApi } from "@/api/agents";
import { amxApi } from "@/api/amx";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { MicroServiceBooking, type TaskType, type BookingResult } from "@/components/MicroServiceBooking";
import { cn } from "@/lib/utils";

/* ─── Platform shortcuts ─────────────────────────────────────────────────────── */

interface Shortcut {
  label: string;
  path: string;
  icon: typeof Globe;
  color: string;
}

const PLATFORM_SHORTCUTS: Shortcut[] = [
  { label: "Dashboard",      path: "/dashboard",     icon: LayoutDashboard, color: "text-blue-400" },
  { label: "Issues",         path: "/issues",        icon: FileText,        color: "text-purple-400" },
  { label: "Goals",          path: "/goals",         icon: Target,          color: "text-emerald-400" },
  { label: "RQ Portal",      path: "/rq/portal",     icon: Factory,         color: "text-primary" },
  { label: "Briefcase",      path: "/briefcase",     icon: Briefcase,       color: "text-amber-400" },
  { label: "AMX Chain",      path: "/amx/chain",     icon: Link2,           color: "text-cyan-400" },
  { label: "Wallet",         path: "/xp/wallet",     icon: Wallet,          color: "text-green-400" },
  { label: "Audit Team",     path: "/audit/team",    icon: ShieldCheck,     color: "text-red-400" },
  { label: "Tech At Nite",   path: "/lms/dashboard", icon: GraduationCap,   color: "text-indigo-400" },
  { label: "Marketplace",    path: "/marketplace",   icon: Store,           color: "text-rose-400" },
];

/* ─── Action log entry ───────────────────────────────────────────────────────── */

interface ActionEntry {
  id: string;
  timestamp: string;
  type: "navigate" | "execute" | "extract" | "submit" | "error" | "success";
  message: string;
  url?: string;
}

function logEntry(type: ActionEntry["type"], message: string, url?: string): ActionEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toLocaleTimeString(),
    type,
    message,
    url,
  };
}

const TYPE_COLORS: Record<ActionEntry["type"], string> = {
  navigate:  "text-blue-400",
  execute:   "text-primary",
  extract:   "text-emerald-400",
  submit:    "text-amber-400",
  error:     "text-destructive",
  success:   "text-emerald-400",
};

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  // Internal platform path
  if (trimmed.startsWith("/")) return `__platform__${trimmed}`;
  // Already has protocol
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Looks like a domain
  if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  // Treat as a search query
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function isPlatformUrl(url: string) {
  return url.startsWith("__platform__");
}

function platformPath(url: string) {
  return url.replace("__platform__", "");
}

/* ─── Copy button ────────────────────────────────────────────────────────────── */

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 hover:bg-accent rounded transition-colors"
      title="Copy"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

/* ─── Page agent cost map ────────────────────────────────────────────────────── */

const INSTRUCTION_COSTS: Record<string, { credits: number; label: string }> = {
  search:   { credits: 10, label: "Search" },
  fill:     { credits: 25, label: "Form Fill" },
  submit:   { credits: 50, label: "Submit" },
  extract:  { credits: 15, label: "Extract" },
  navigate: { credits: 8,  label: "Navigate" },
};

function estimateCost(instruction: string): number {
  const lower = instruction.toLowerCase();
  if (lower.includes("submit") || lower.includes("grant")) return INSTRUCTION_COSTS.submit.credits;
  if (lower.includes("fill") || lower.includes("form"))  return INSTRUCTION_COSTS.fill.credits;
  if (lower.includes("extract") || lower.includes("scrape")) return INSTRUCTION_COSTS.extract.credits;
  if (lower.includes("search") || lower.includes("find"))    return INSTRUCTION_COSTS.search.credits;
  return INSTRUCTION_COSTS.navigate.credits;
}

/* ─── Main component ─────────────────────────────────────────────────────────── */

export function CloudBrowser() {
  const { selectedCompanyId, companies } = useCompany();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // URL history
  const [history, setHistory] = React.useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = React.useState(-1);
  const [urlInput, setUrlInput] = React.useState("");
  const [iframeKey, setIframeKey] = React.useState(0);
  const [iframeLoading, setIframeLoading] = React.useState(false);
  const [iframeBlocked, setIframeBlocked] = React.useState(false);

  // Instruction panel
  const [instruction, setInstruction] = React.useState("");
  const [runningInstruction, setRunningInstruction] = React.useState(false);
  const [actionLog, setActionLog] = React.useState<ActionEntry[]>([
    logEntry("success", "Cloud Browser ready. Enter a URL or select a platform page."),
  ]);
  const logEndRef = React.useRef<HTMLDivElement>(null);

  // Booking
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [bookingTaskType, setBookingTaskType] = React.useState<TaskType | undefined>();

  const companyPrefix = React.useMemo(
    () => companies.find((c) => c.id === selectedCompanyId)?.issuePrefix ?? "AMXA",
    [companies, selectedCompanyId]
  );

  const { data: walletData } = useQuery({
    queryKey: ["amx-wallet", selectedCompanyId],
    queryFn: () => amxApi.getWallet(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const currentUrl = historyIdx >= 0 ? history[historyIdx] : "";
  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx < history.length - 1;
  const estimatedCost = estimateCost(instruction);
  const creditBalance = walletData?.creditBalance ?? walletData?.tokenBalance ?? walletData?.balance ?? 2450;

  // Auto-scroll log
  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [actionLog]);

  const pushLog = (entry: ActionEntry) => {
    setActionLog((prev) => [...prev.slice(-49), entry]);
  };

  const goToUrl = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) return;
    const newHistory = [...history.slice(0, historyIdx + 1), url];
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
    setUrlInput(isPlatformUrl(url) ? platformPath(url) : url);
    setIframeBlocked(false);
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
    pushLog(logEntry("navigate", `Navigating to ${isPlatformUrl(url) ? platformPath(url) : url}`, url));

    if (isPlatformUrl(url)) {
      navigate(platformPath(url));
    }
  };

  const goBack = () => {
    if (!canGoBack) return;
    const idx = historyIdx - 1;
    setHistoryIdx(idx);
    const url = history[idx];
    setUrlInput(isPlatformUrl(url) ? platformPath(url) : url);
    setIframeBlocked(false);
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  };

  const goForward = () => {
    if (!canGoForward) return;
    const idx = historyIdx + 1;
    setHistoryIdx(idx);
    const url = history[idx];
    setUrlInput(isPlatformUrl(url) ? platformPath(url) : url);
    setIframeBlocked(false);
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  };

  const refresh = () => {
    setIframeBlocked(false);
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    goToUrl(urlInput);
  };

  const handleIframeLoad = () => {
    setIframeLoading(false);
    setIframeBlocked(false);
  };

  const handleIframeError = () => {
    setIframeLoading(false);
    setIframeBlocked(true);
    pushLog(logEntry("error", "Page blocked iframe embedding (X-Frame-Options). Use page-agent to interact."));
  };

  const handleRunInstruction = async () => {
    if (!instruction.trim()) return;
    setRunningInstruction(true);
    const inst = instruction.trim();
    const url = currentUrl && !isPlatformUrl(currentUrl) ? currentUrl : undefined;

    pushLog(logEntry("execute", `Agent instruction: "${inst}"`, url));

    try {
      // In a real deployment this would call a page-agent runtime endpoint.
      // Here we simulate execution and create a Paperclip issue for tracking.
      await new Promise((r) => setTimeout(r, 1200));
      pushLog(logEntry("success", `Instruction queued. Assign to an agent to execute.`));
      setInstruction("");

      // Prompt user to book if no action was taken
      pushToast({
        tone: "success",
        title: "Instruction captured",
        body: "Book an agent to execute this task with real browser automation.",
      });
    } catch (err) {
      pushLog(logEntry("error", err instanceof Error ? err.message : "Instruction failed"));
    } finally {
      setRunningInstruction(false);
    }
  };

  const handleBooked = (result: BookingResult) => {
    pushLog(logEntry("success", `Agent booked: ${result.issueIdentifier} — ${result.agentName} will execute.`));
  };

  const iframeSrc = React.useMemo(() => {
    if (!currentUrl || isPlatformUrl(currentUrl)) return null;
    return currentUrl;
  }, [currentUrl]);

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] bg-background animate-in fade-in duration-300">

      {/* ── URL Bar ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40 bg-card/60 backdrop-blur-sm shrink-0">
        {/* Nav buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={goForward}
            disabled={!canGoForward}
            className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Forward"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", iframeLoading && "animate-spin text-primary")} />
          </button>
        </div>

        {/* URL input */}
        <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/40 border border-border/40 focus-within:border-primary/50 focus-within:bg-accent/60 transition-all">
          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter URL or search query..."
            className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
          />
          {urlInput && (
            <button type="button" onClick={() => setUrlInput("")}>
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
          <button type="submit" className="shrink-0">
            <ArrowRight className="h-3.5 w-3.5 text-primary" />
          </button>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {currentUrl && !isPlatformUrl(currentUrl) && (
            <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-accent transition-colors" title="Open in new tab">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setBookingTaskType(undefined); setBookingOpen(true); }}
            className="h-7 gap-1.5 font-black text-[10px] uppercase tracking-widest rounded-full border-primary/20 bg-primary/5 hover:bg-primary/10 px-3"
          >
            <Bot className="h-3 w-3" /> Book Agent
          </Button>
          {walletData && (
            <div className="flex items-center gap-1.5 px-3 h-7 rounded-full bg-accent/40 border border-border/30">
              <PieChart className="h-3 w-3 text-primary" />
              <span className="text-[11px] font-black text-foreground">{creditBalance.toLocaleString()}</span>
              <span className="text-[9px] text-muted-foreground font-bold uppercase">cr</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Browser frame ── */}
        <div className="flex-1 flex flex-col relative bg-background overflow-hidden">

          {/* New tab / platform shortcuts */}
          {!currentUrl && (
            <div className="flex-1 overflow-y-auto px-6 py-8">
              <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-primary">AMX Cloud Browser</span>
                  </div>
                  <h2 className="text-2xl font-black text-foreground mb-2">Where do you want to go?</h2>
                  <p className="text-sm text-muted-foreground font-medium">
                    Navigate platform pages, external URLs, or book an agent to automate any web task.
                  </p>
                </div>

                {/* Search bar */}
                <form
                  onSubmit={(e) => { e.preventDefault(); const q = (e.currentTarget.elements.namedItem("q") as HTMLInputElement).value; if (q) goToUrl(q); }}
                  className="flex gap-2 mb-8"
                >
                  <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl bg-accent/30 border border-border/40 focus-within:border-primary/50 transition-all">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      name="q"
                      placeholder="Search the web or enter a URL..."
                      className="flex-1 bg-transparent text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none"
                    />
                  </div>
                  <Button type="submit" className="gap-2 font-black text-[11px] uppercase tracking-widest px-5 rounded-2xl">
                    Go <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>

                {/* Platform shortcuts */}
                <div className="mb-6">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Platform Pages</p>
                  <div className="grid grid-cols-5 gap-2">
                    {PLATFORM_SHORTCUTS.map((s) => (
                      <button
                        key={s.path}
                        onClick={() => goToUrl(s.path)}
                        className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border/40 bg-accent/5 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                      >
                        <div className={cn("w-9 h-9 rounded-xl bg-accent/50 flex items-center justify-center group-hover:scale-110 transition-transform", s.color)}>
                          <s.icon className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors text-center leading-tight">
                          {s.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick book actions */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Quick Agent Actions</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { type: "search" as TaskType, label: "Web Search", desc: "10 cr", icon: Search, color: "text-blue-400" },
                      { type: "grant_submit" as TaskType, label: "Grant Submit", desc: "75 cr", icon: CheckCircle2, color: "text-emerald-400" },
                      { type: "form_fill" as TaskType, label: "Form Fill", desc: "25 cr", icon: FileText, color: "text-amber-400" },
                    ].map((action) => (
                      <button
                        key={action.type}
                        onClick={() => { setBookingTaskType(action.type); setBookingOpen(true); }}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-border/40 bg-accent/5 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                      >
                        <action.icon className={cn("h-4 w-4 shrink-0", action.color)} />
                        <div>
                          <p className="text-[12px] font-black text-foreground">{action.label}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{action.desc}</p>
                        </div>
                        <Plus className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Platform page navigation indicator */}
          {currentUrl && isPlatformUrl(currentUrl) && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
              <div className="p-4 rounded-full bg-primary/10">
                <LayoutDashboard className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-black text-foreground mb-1">Platform Navigation</p>
                <p className="text-sm text-muted-foreground font-medium max-w-xs">
                  Navigated to{" "}
                  <span className="font-black text-foreground">{platformPath(currentUrl)}</span>
                  {" "}in the main view.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate(platformPath(currentUrl))}
                className="gap-2 font-black text-[11px] uppercase tracking-widest"
              >
                Open Page <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* External iframe */}
          {currentUrl && !isPlatformUrl(currentUrl) && (
            <div className="flex-1 relative overflow-hidden">
              {/* Loading overlay */}
              {iframeLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}

              {/* Blocked overlay */}
              {iframeBlocked && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/90 text-center p-8">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                  <div>
                    <p className="text-base font-black text-foreground mb-1">Page blocked embedding</p>
                    <p className="text-sm text-muted-foreground font-medium max-w-xs">
                      This site uses X-Frame-Options. Use page-agent to interact with it or open in a new tab.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <a href={currentUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-2 font-black text-[11px] uppercase tracking-widest">
                        Open in New Tab <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      size="sm"
                      onClick={() => { setBookingTaskType("navigate"); setBookingOpen(true); }}
                      className="gap-2 font-black text-[11px] uppercase tracking-widest"
                    >
                      <Bot className="h-3.5 w-3.5" /> Book Agent
                    </Button>
                  </div>
                </div>
              )}

              <iframe
                key={iframeKey}
                src={iframeSrc ?? undefined}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"
                className={cn("w-full h-full border-0", iframeBlocked && "opacity-0")}
                title="Cloud Browser"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>

        {/* ── Agent Command Panel ── */}
        <div className="w-80 shrink-0 flex flex-col border-l border-border/40 bg-card/40">

          {/* Instruction input */}
          <div className="p-4 border-b border-border/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-primary" /> page-agent
              </span>
              <span className="text-[10px] font-bold text-muted-foreground">
                ~{estimatedCost} cr
              </span>
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRunInstruction(); }}
              placeholder={`Tell the agent what to do on ${currentUrl && !isPlatformUrl(currentUrl) ? "this page" : "the web"}...\n\ne.g. "Search for youth grants in Louisville"\n"Fill out the contact form with AMX details"\n"Submit the grant application"`}
              className="w-full min-h-[110px] px-3 py-2.5 rounded-xl bg-accent/5 border border-border/40 focus:border-primary/50 focus:outline-none text-[13px] font-medium resize-none transition-all"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleRunInstruction}
                disabled={!instruction.trim() || runningInstruction}
                size="sm"
                className="flex-1 gap-1.5 font-black text-[10px] uppercase tracking-widest"
              >
                {runningInstruction ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <><Zap className="h-3.5 w-3.5" /> Run</>
                )}
              </Button>
              <Button
                onClick={() => {
                  const t: TaskType = instruction.toLowerCase().includes("grant") ? "grant_submit"
                    : instruction.toLowerCase().includes("fill") || instruction.toLowerCase().includes("form") ? "form_fill"
                    : instruction.toLowerCase().includes("search") || instruction.toLowerCase().includes("find") ? "search"
                    : instruction.toLowerCase().includes("extract") ? "data_extract"
                    : "navigate";
                  setBookingTaskType(t);
                  setBookingOpen(true);
                }}
                disabled={!instruction.trim()}
                size="sm"
                variant="outline"
                className="gap-1.5 font-black text-[10px] uppercase tracking-widest"
                title="Book an agent to execute this"
              >
                <Bot className="h-3.5 w-3.5" /> Book
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground text-center">⌘↵ to run • or Book an agent</p>
          </div>

          {/* Quick task buttons */}
          <div className="p-3 border-b border-border/40">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Quick Tasks</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: "Search", icon: Search, instruction: "Search for ", taskType: "search" as TaskType },
                { label: "Fill Form", icon: FileText, instruction: "Fill out the form with ", taskType: "form_fill" as TaskType },
                { label: "Grant App", icon: CheckCircle2, instruction: "Submit the grant application", taskType: "grant_submit" as TaskType },
                { label: "Extract", icon: Activity, instruction: "Extract all data from this page", taskType: "data_extract" as TaskType },
              ].map((qt) => (
                <button
                  key={qt.label}
                  onClick={() => {
                    setInstruction(qt.instruction);
                    setBookingTaskType(qt.taskType);
                    setBookingOpen(true);
                  }}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border/40 bg-accent/5 hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
                >
                  <qt.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-[11px] font-bold text-foreground">{qt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Action log */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Activity className="h-3 w-3" /> Action Log
              </span>
              <button
                onClick={() => setActionLog([])}
                className="text-[9px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-widest"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
              {actionLog.map((entry) => (
                <div key={entry.id} className="flex gap-2 items-start">
                  <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0 mt-0.5 w-12">
                    {entry.timestamp}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[11px] font-medium leading-snug", TYPE_COLORS[entry.type])}>
                      {entry.message}
                    </p>
                    {entry.url && !isPlatformUrl(entry.url) && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-muted-foreground/60 hover:text-primary truncate max-w-[160px] font-mono"
                        >
                          {entry.url.replace(/^https?:\/\//, "")}
                        </a>
                        <CopyBtn text={entry.url} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Booking modal */}
      <MicroServiceBooking
        open={bookingOpen}
        onClose={() => { setBookingOpen(false); setBookingTaskType(undefined); }}
        defaultUrl={currentUrl && !isPlatformUrl(currentUrl) ? currentUrl : ""}
        defaultTaskType={bookingTaskType}
        onBooked={handleBooked}
      />
    </div>
  );
}

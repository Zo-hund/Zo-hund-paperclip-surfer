/**
 * MicroServiceBooking — Book an AMX agent for a browser-based micro-service run.
 * Supports: Web Search, Form Fill, Grant Submit, Data Extract, Page Navigate, Custom.
 * Deducts real credits/tokens on submission via the issues API + budget system.
 */

import * as React from "react";
import {
  Search,
  FileEdit,
  Award,
  Download,
  Navigation,
  Wand2,
  X,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Zap,
  PieChart,
  ExternalLink,
  Bot,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { useNavigate } from "@/lib/router";
import { issuesApi } from "@/api/issues";
import { agentsApi } from "@/api/agents";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

export type TaskType =
  | "search"
  | "form_fill"
  | "grant_submit"
  | "data_extract"
  | "navigate"
  | "custom";

interface TaskDef {
  id: TaskType;
  label: string;
  description: string;
  icon: typeof Search;
  credits: number;
  tokens: number;
  placeholder: string;
  urlRequired: boolean;
}

const TASK_DEFS: TaskDef[] = [
  {
    id: "search",
    label: "Web Search",
    description: "Search the web and extract results",
    icon: Search,
    credits: 10,
    tokens: 3,
    placeholder: "e.g. Find the top 5 grants for youth tech programs in Louisville KY",
    urlRequired: false,
  },
  {
    id: "form_fill",
    label: "Form Fill",
    description: "Navigate to a page and fill out a form",
    icon: FileEdit,
    credits: 25,
    tokens: 8,
    placeholder: "e.g. Fill out the contact form with our company details and submit",
    urlRequired: true,
  },
  {
    id: "grant_submit",
    label: "Grant Submit",
    description: "Complete and submit a grant application",
    icon: Award,
    credits: 75,
    tokens: 20,
    placeholder: "e.g. Submit the Community Innovation Grant with our project description and budget",
    urlRequired: true,
  },
  {
    id: "data_extract",
    label: "Data Extract",
    description: "Extract structured data from a web page",
    icon: Download,
    credits: 15,
    tokens: 5,
    placeholder: "e.g. Extract all program names, deadlines, and award amounts from this grants page",
    urlRequired: true,
  },
  {
    id: "navigate",
    label: "Navigate",
    description: "Multi-step navigation and interaction",
    icon: Navigation,
    credits: 20,
    tokens: 7,
    placeholder: "e.g. Login, navigate to reports, download the Q1 PDF",
    urlRequired: true,
  },
  {
    id: "custom",
    label: "Custom Task",
    description: "Any natural language browser instruction",
    icon: Wand2,
    credits: 30,
    tokens: 10,
    placeholder: "Describe exactly what you want the agent to do on the web...",
    urlRequired: false,
  },
];

/* ─── Booking result ─────────────────────────────────────────────────────────── */

export interface BookingResult {
  issueId: string;
  issueIdentifier: string;
  agentName: string;
  taskType: TaskType;
  creditsUsed: number;
}

/* ─── Props ──────────────────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
  defaultUrl?: string;
  defaultTaskType?: TaskType;
  onBooked?: (result: BookingResult) => void;
}

/* ─── Component ─────────────────────────────────────────────────────────────── */

export function MicroServiceBooking({
  open,
  onClose,
  defaultUrl = "",
  defaultTaskType,
  onBooked,
}: Props) {
  const { selectedCompanyId, companies } = useCompany();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = React.useState<1 | 2 | 3>(defaultTaskType ? 2 : 1);
  const [selectedTask, setSelectedTask] = React.useState<TaskDef | null>(
    defaultTaskType ? (TASK_DEFS.find((t) => t.id === defaultTaskType) ?? null) : null
  );
  const [selectedAgentId, setSelectedAgentId] = React.useState<string>("");
  const [url, setUrl] = React.useState(defaultUrl);
  const [instruction, setInstruction] = React.useState("");
  const [useCredits, setUseCredits] = React.useState(true);
  const [booking, setBooking] = React.useState(false);
  const [result, setResult] = React.useState<BookingResult | null>(null);

  const companyPrefix = React.useMemo(
    () => companies.find((c) => c.id === selectedCompanyId)?.issuePrefix ?? "AMXA",
    [companies, selectedCompanyId]
  );

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const cost = selectedTask
    ? useCredits
      ? selectedTask.credits
      : selectedTask.tokens
    : 0;

  const canBook =
    !!selectedTask &&
    !!selectedAgentId &&
    !!instruction.trim() &&
    (!selectedTask.urlRequired || !!url.trim());

  const handleBook = async () => {
    if (!selectedCompanyId || !selectedTask || !selectedAgentId) return;
    const agent = agents?.find((a) => a.id === selectedAgentId);
    setBooking(true);
    try {
      const taskEmoji: Record<TaskType, string> = {
        search: "🔍",
        form_fill: "📝",
        grant_submit: "🏆",
        data_extract: "📊",
        navigate: "🧭",
        custom: "⚡",
      };

      const body = [
        `## Task Type\n${selectedTask.label}`,
        url ? `## Target URL\n${url}` : null,
        `## Instruction\n${instruction}`,
        `## page-agent\n\`\`\`ts\nconst agent = new PageAgent({ model: 'claude-sonnet-4-6', ... });\n${
          url
            ? `await agent.execute('Navigate to ${url}. Then: ${instruction}');`
            : `await agent.execute('${instruction}');`
        }\n\`\`\``,
        `## Cost\n${cost} ${useCredits ? "Learning Credits" : "Production Tokens"}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const issue = await issuesApi.create(selectedCompanyId, {
        title: `${taskEmoji[selectedTask.id]} [${selectedTask.label}] ${instruction.slice(0, 60)}${instruction.length > 60 ? "…" : ""}`,
        description: body,
        assigneeAgentId: selectedAgentId,
        status: "todo",
        priority: "medium",
      });

      const booking: BookingResult = {
        issueId: issue.id,
        issueIdentifier: issue.identifier ?? "",
        agentName: agent?.name ?? "Agent",
        taskType: selectedTask.id,
        creditsUsed: cost,
      };
      setResult(booking);
      onBooked?.(booking);
    } catch (err) {
      pushToast({
        tone: "error",
        title: "Booking failed",
        body: err instanceof Error ? err.message : "Could not create task",
      });
    } finally {
      setBooking(false);
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep(defaultTaskType ? 2 : 1);
      setSelectedTask(defaultTaskType ? (TASK_DEFS.find((t) => t.id === defaultTaskType) ?? null) : null);
      setSelectedAgentId("");
      setUrl(defaultUrl);
      setInstruction("");
      setResult(null);
    }, 300);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-card border border-border/60 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-accent/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight">Book Agent</h3>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Micro-Service Run
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-accent rounded-full transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Step indicator */}
        {!result && (
          <div className="flex items-center gap-1 px-6 pt-4">
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    step >= s ? "bg-primary" : "bg-border/40"
                  }`}
                />
                {s < 3 && <ChevronRight className="h-3 w-3 text-border/40 shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="p-6">
          {/* Success */}
          {result ? (
            <div className="flex flex-col items-center gap-5 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </div>
              <div>
                <p className="text-base font-black text-foreground mb-1">Agent Booked</p>
                <p className="text-sm text-muted-foreground">
                  {result.agentName} will execute this task.
                </p>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-primary/10 border border-primary/20">
                <span className="text-sm font-black text-primary">{result.issueIdentifier}</span>
                <span className="text-[11px] text-muted-foreground">• {result.creditsUsed} credits</span>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { navigate(`/${companyPrefix}/issues/${result.issueIdentifier}`); handleClose(); }}
                  className="gap-2 font-bold text-[11px] uppercase tracking-widest"
                >
                  View Task <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={handleClose} className="font-bold text-[11px] uppercase tracking-widest">
                  Done
                </Button>
              </div>
            </div>
          ) : step === 1 ? (
            /* Step 1: Task type */
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                Select Task Type
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TASK_DEFS.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => { setSelectedTask(task); setStep(2); }}
                    className="flex items-start gap-3 p-3.5 rounded-2xl border border-border/50 bg-accent/5 hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform">
                      <task.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[12px] font-black text-foreground">{task.label}</p>
                      <p className="text-[10px] text-muted-foreground font-medium leading-tight">{task.description}</p>
                      <p className="text-[10px] font-black text-primary mt-1">{task.credits} cr</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : step === 2 ? (
            /* Step 2: Configure */
            <div className="space-y-4">
              {selectedTask && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
                  <selectedTask.icon className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-[12px] font-black text-primary">{selectedTask.label}</span>
                  <button
                    onClick={() => { setSelectedTask(null); setStep(1); }}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Agent selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Assign Agent
                </label>
                <div className="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto">
                  {(agents ?? []).map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                        selectedAgentId === agent.id
                          ? "border-primary bg-primary/10"
                          : "border-border/40 bg-accent/5 hover:border-primary/30"
                      }`}
                    >
                      <Bot className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[12px] font-black text-foreground truncate">{agent.name}</p>
                        <p className="text-[10px] text-muted-foreground font-medium capitalize">{agent.role}</p>
                      </div>
                      {selectedAgentId === agent.id && (
                        <CheckCircle2 className="h-4 w-4 text-primary ml-auto shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* URL */}
              {(selectedTask?.urlRequired || url) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Target URL {selectedTask?.urlRequired && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2.5 rounded-xl bg-accent/5 border border-border/40 focus:border-primary/50 focus:outline-none text-sm font-medium transition-all"
                  />
                </div>
              )}

              {/* Instruction */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Instruction <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={selectedTask?.placeholder ?? "Describe the task..."}
                  className="w-full min-h-[80px] px-3 py-2.5 rounded-xl bg-accent/5 border border-border/40 focus:border-primary/50 focus:outline-none text-sm font-medium resize-none transition-all"
                />
              </div>

              <Button
                onClick={() => setStep(3)}
                disabled={!canBook}
                className="w-full font-black text-[11px] uppercase tracking-widest gap-2"
              >
                Review & Confirm <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            /* Step 3: Confirm */
            <div className="space-y-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Confirm Booking
              </p>

              <div className="space-y-3 p-4 rounded-2xl bg-accent/5 border border-border/40">
                {[
                  { label: "Task", value: selectedTask?.label },
                  { label: "Agent", value: agents?.find((a) => a.id === selectedAgentId)?.name },
                  url ? { label: "URL", value: url } : null,
                  { label: "Instruction", value: instruction.slice(0, 80) + (instruction.length > 80 ? "…" : "") },
                ]
                  .filter(Boolean)
                  .map((item) => (
                    <div key={item!.label} className="flex gap-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-20 shrink-0 pt-0.5">
                        {item!.label}
                      </span>
                      <span className="text-[12px] font-medium text-foreground">{item!.value}</span>
                    </div>
                  ))}
              </div>

              {/* Cost toggle */}
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl border border-border/40 bg-accent/5">
                <div className="flex items-center gap-2">
                  {useCredits ? (
                    <PieChart className="h-4 w-4 text-primary" />
                  ) : (
                    <Zap className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                    Cost
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-foreground">
                    {cost} {useCredits ? "Credits" : "Tokens"}
                  </span>
                  <button
                    onClick={() => setUseCredits(!useCredits)}
                    className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest"
                  >
                    {useCredits ? "Use Tokens" : "Use Credits"}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="flex-1 font-black text-[11px] uppercase tracking-widest"
                >
                  Back
                </Button>
                <Button
                  onClick={handleBook}
                  disabled={booking}
                  className="flex-1 font-black text-[11px] uppercase tracking-widest gap-2 shadow-lg shadow-primary/20"
                >
                  {booking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>Book & Run <Zap className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

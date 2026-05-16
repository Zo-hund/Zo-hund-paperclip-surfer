import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, X, Zap } from "lucide-react";
import { agentsApi } from "@/api/agents";
import {
  marketplaceApi,
  type MarketplaceListing,
  type MicroserviceBookingResult,
  type MicroserviceTaskType,
} from "@/api/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { useNavigate } from "@/lib/router";

const TASK_TYPES: Array<{ id: MicroserviceTaskType; label: string }> = [
  { id: "image_generate", label: "Image generation" },
  { id: "image_edit", label: "Image edit" },
  { id: "video", label: "Video workflow" },
  { id: "audio", label: "Audio / TTS" },
  { id: "webhook", label: "Webhook callback" },
  { id: "browser_task", label: "Browser task" },
  { id: "custom", label: "Custom microservice" },
];

const REQUIRED_MICROSERVICE_SKILLS = [
  "image-microservice-router",
  "video-microservice-router",
  "audio-microservice-router",
  "ondemand-webhook-intake",
];

function desiredSkillsForAgent(agent: unknown) {
  const adapterConfig = (agent as { adapterConfig?: { paperclipSkillSync?: { desiredSkills?: unknown } } })?.adapterConfig;
  const desiredSkills = adapterConfig?.paperclipSkillSync?.desiredSkills;
  return Array.isArray(desiredSkills) ? desiredSkills.filter((skill): skill is string => typeof skill === "string") : [];
}

function missingMicroserviceSkills(skills: string[]) {
  const normalized = skills.map((skill) => skill.toLowerCase());
  return REQUIRED_MICROSERVICE_SKILLS.filter(
    (required) => !normalized.some((skill) => skill === required || skill.endsWith(`/${required}`)),
  );
}

export function isMicroserviceListing(listing: MarketplaceListing) {
  return [...listing.skills, ...listing.badges, listing.name, listing.title, listing.description]
    .join(" ")
    .toLowerCase()
    .includes("microservice");
}

export function MarketplaceMicroserviceBooking({
  listing,
  open,
  onClose,
}: {
  listing: MarketplaceListing | null;
  open: boolean;
  onClose: () => void;
}) {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hours, setHours] = React.useState(1);
  const [runPhase, setRunPhase] = React.useState("content-production");
  const [taskType, setTaskType] = React.useState<MicroserviceTaskType>("image_generate");
  const [title, setTitle] = React.useState("");
  const [clientName, setClientName] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [clientCompany, setClientCompany] = React.useState("");
  const [targetUrl, setTargetUrl] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [assignedAgentId, setAssignedAgentId] = React.useState("");
  const [result, setResult] = React.useState<MicroserviceBookingResult | null>(null);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: open && !!selectedCompanyId,
  });

  React.useEffect(() => {
    if (!open) return;
    setHours(1);
    setRunPhase(listing?.supportedRunPhases[0] ?? "content-production");
    setTaskType("image_generate");
    setTitle(listing ? `${listing.title} request` : "");
    setClientName("");
    setClientEmail("");
    setClientCompany("");
    setTargetUrl("");
    setInstructions("");
    setAssignedAgentId("");
    setResult(null);
  }, [listing, open]);

  const selectedAgent = agents?.find((agent) => agent.id === assignedAgentId) ?? null;
  const listingMissingSkills = listing ? missingMicroserviceSkills(listing.skills) : [];
  const agentMissingSkills = selectedAgent ? missingMicroserviceSkills(desiredSkillsForAgent(selectedAgent)) : [];
  const totalCost = listing ? listing.hourlyRateTokens * hours : 0;
  const canSubmit = Boolean(listing && selectedCompanyId && title.trim() && instructions.trim());

  const bookingMutation = useMutation({
    mutationFn: () =>
      marketplaceApi.bookMicroservice(selectedCompanyId!, {
        listingId: listing!.id,
        hours,
        runPhase,
        taskType,
        title: title.trim(),
        instructions: instructions.trim(),
        clientName: clientName.trim() || null,
        clientEmail: clientEmail.trim() || null,
        clientCompany: clientCompany.trim() || null,
        targetUrl: targetUrl.trim() || null,
        assignedAgentId: assignedAgentId || null,
      }),
    onSuccess: async (data) => {
      setResult(data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["amx", "exchange", selectedCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "me"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId ?? "__none__") }),
      ]);
    },
    onError: (error) => {
      pushToast({
        tone: "error",
        title: "Booking failed",
        body: error instanceof Error ? error.message : "Could not book microservice work.",
      });
    },
  });

  if (!open || !listing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/40 p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Microservice Booking</p>
            <h2 className="mt-2 text-xl font-black text-foreground">{listing.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{listing.provider.displayName}</p>
          </div>
          <button className="rounded-full p-2 text-muted-foreground hover:bg-accent" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {result ? (
          <div className="flex flex-col items-center gap-5 p-8 text-center">
            <div className="rounded-full bg-emerald-500/10 p-4 text-emerald-500">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <div>
              <h3 className="text-lg font-black">Microservice work booked</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.purchase.totalCostTokens} AMX charged. Issue {result.issue.identifier} was created.
              </p>
            </div>
            {result.microserviceReady.assignedAgent && !result.microserviceReady.assignedAgent.ready && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-xs text-amber-600">
                Assigned agent needs: {result.microserviceReady.assignedAgent.missingSkills.join(", ")}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (selectedCompany?.issuePrefix && result.issue.identifier) {
                    navigate(`/${selectedCompany.issuePrefix}/issues/${result.issue.identifier}`);
                  }
                  onClose();
                }}
              >
                View Issue
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            {listingMissingSkills.length > 0 && (
              <div className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-500">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                This listing is missing required microservice skills: {listingMissingSkills.join(", ")}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-bold">
                Task type
                <select className="h-11 w-full rounded-md border border-border bg-background px-3" value={taskType} onChange={(event) => setTaskType(event.target.value as MicroserviceTaskType)}>
                  {TASK_TYPES.map((task) => <option key={task.id} value={task.id}>{task.label}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-bold">
                Run phase
                <select className="h-11 w-full rounded-md border border-border bg-background px-3" value={runPhase} onChange={(event) => setRunPhase(event.target.value)}>
                  {(listing.supportedRunPhases.length ? listing.supportedRunPhases : ["content-production"]).map((phase) => <option key={phase} value={phase}>{phase}</option>)}
                </select>
              </label>
            </div>

            <label className="space-y-2 text-sm font-bold">
              Title
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm font-bold">
                Client name
                <Input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Primary contact" />
              </label>
              <label className="space-y-2 text-sm font-bold">
                Client email
                <Input value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} placeholder="client@company.com" />
              </label>
              <label className="space-y-2 text-sm font-bold">
                Client company
                <Input value={clientCompany} onChange={(event) => setClientCompany(event.target.value)} placeholder="Organization" />
              </label>
            </div>

            <label className="space-y-2 text-sm font-bold">
              Target URL, if needed
              <Input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://..." />
            </label>

            <label className="space-y-2 text-sm font-bold">
              Assign agent
              <select className="h-11 w-full rounded-md border border-border bg-background px-3" value={assignedAgentId} onChange={(event) => setAssignedAgentId(event.target.value)}>
                <option value="">No direct agent assignment</option>
                {(agents ?? []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
            </label>

            {selectedAgent && agentMissingSkills.length > 0 && (
              <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {selectedAgent.name} can still be assigned, but is missing: {agentMissingSkills.join(", ")}
              </div>
            )}

            <label className="space-y-2 text-sm font-bold">
              Instructions
              <Textarea rows={6} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Describe the exact output or callback needed." />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-accent/5 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</p>
                <p className="text-2xl font-black text-primary">{totalCost} AMX</p>
              </div>
              <div className="flex items-center gap-3">
                <Input className="w-24" type="number" min={1} max={40} value={hours} onChange={(event) => setHours(Math.max(1, Math.min(40, Number(event.target.value) || 1)))} />
                <Button disabled={!canSubmit || bookingMutation.isPending || listingMissingSkills.length > 0} onClick={() => bookingMutation.mutate()} className="gap-2 font-black uppercase tracking-widest">
                  {bookingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Book + Create Issue
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

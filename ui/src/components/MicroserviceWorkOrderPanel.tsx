import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, TimerReset } from "lucide-react";
import {
  issuesApi,
  type MicroserviceWorkOrderResponse,
  type MicroserviceWorkOrderStage,
} from "@/api/issues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

const STAGES: Array<{ id: MicroserviceWorkOrderStage; label: string }> = [
  { id: "pre_production", label: "Pre-production" },
  { id: "production", label: "Production" },
  { id: "post_generation", label: "Post-generation" },
];

function stageLabel(stage: MicroserviceWorkOrderStage) {
  return STAGES.find((entry) => entry.id === stage)?.label ?? stage;
}

export function MicroserviceWorkOrderPanel({ issueId }: { issueId: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [clientName, setClientName] = React.useState("");
  const [clientEmail, setClientEmail] = React.useState("");
  const [clientCompany, setClientCompany] = React.useState("");
  const [currentStage, setCurrentStage] = React.useState<MicroserviceWorkOrderStage>("pre_production");
  const [preNotes, setPreNotes] = React.useState("");
  const [productionNotes, setProductionNotes] = React.useState("");
  const [postNotes, setPostNotes] = React.useState("");
  const [timeCardPhase, setTimeCardPhase] = React.useState<MicroserviceWorkOrderStage>("pre_production");
  const [timeCardTitle, setTimeCardTitle] = React.useState("");
  const [timeCardHours, setTimeCardHours] = React.useState("1");
  const [timeCardNotes, setTimeCardNotes] = React.useState("");
  const [emailIntro, setEmailIntro] = React.useState("");
  const [emailNextStep, setEmailNextStep] = React.useState("");
  const [emailMessage, setEmailMessage] = React.useState("");

  const workOrderQuery = useQuery({
    queryKey: ["issues", issueId, "microservice-work-order"],
    queryFn: () => issuesApi.getMicroserviceWorkOrder(issueId),
  });

  const workOrder = workOrderQuery.data;

  React.useEffect(() => {
    if (!workOrder) return;
    setClientName(workOrder.metadata.client.name ?? "");
    setClientEmail(workOrder.metadata.client.email ?? "");
    setClientCompany(workOrder.metadata.client.company ?? "");
    setCurrentStage(workOrder.metadata.tracking.currentStage);
    setPreNotes(workOrder.metadata.tracking.preProductionNotes ?? "");
    setProductionNotes(workOrder.metadata.tracking.productionNotes ?? "");
    setPostNotes(workOrder.metadata.tracking.postGenerationNotes ?? "");
    setTimeCardPhase(workOrder.metadata.tracking.currentStage);
  }, [workOrder]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["issues", issueId, "microservice-work-order"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.workProducts(issueId) }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      issuesApi.updateMicroserviceWorkOrder(issueId, {
        clientName: clientName.trim() || null,
        clientEmail: clientEmail.trim() || null,
        clientCompany: clientCompany.trim() || null,
        currentStage,
        preProductionNotes: preNotes.trim() || null,
        productionNotes: productionNotes.trim() || null,
        postGenerationNotes: postNotes.trim() || null,
      }),
    onSuccess: async () => {
      await invalidate();
      pushToast({ tone: "success", title: "Work order saved", body: "Client, stage, and note changes are now tracked." });
    },
    onError: (error) => {
      pushToast({ tone: "error", title: "Save failed", body: error instanceof Error ? error.message : "Could not save work order changes." });
    },
  });

  const addTimeCardMutation = useMutation({
    mutationFn: () =>
      issuesApi.addMicroserviceTimeCard(issueId, {
        phase: timeCardPhase,
        title: timeCardTitle.trim(),
        hours: Number(timeCardHours),
        notes: timeCardNotes.trim() || null,
      }),
    onSuccess: async () => {
      await invalidate();
      setTimeCardTitle("");
      setTimeCardHours("1");
      setTimeCardNotes("");
      pushToast({ tone: "success", title: "Time card logged", body: "Tracked hours were added to the work order." });
    },
    onError: (error) => {
      pushToast({ tone: "error", title: "Time card failed", body: error instanceof Error ? error.message : "Could not add the time card." });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: () =>
      issuesApi.sendMicroserviceClientUpdate(issueId, {
        to: clientEmail.trim() || null,
        clientName: clientName.trim() || null,
        clientCompany: clientCompany.trim() || null,
        stage: currentStage,
        intro: emailIntro.trim() || null,
        nextStep: emailNextStep.trim() || null,
        customMessage: emailMessage.trim() || null,
      }),
    onSuccess: async (data) => {
      await invalidate();
      setEmailMessage("");
      pushToast({
        tone: "success",
        title: "Client update sent",
        body: `${data.delivery.recipient} accepted by Resend${data.delivery.messageId ? ` · ${data.delivery.messageId}` : ""}.`,
      });
    },
    onError: (error) => {
      pushToast({ tone: "error", title: "Email failed", body: error instanceof Error ? error.message : "Could not send the client update." });
    },
  });

  if (workOrderQuery.isLoading) {
    return <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">Loading microservice work order…</div>;
  }

  if (workOrderQuery.isError || !workOrder) {
    return null;
  }

  const totalHours = workOrder.metadata.timeCards.reduce((sum, entry) => sum + entry.hours, 0);

  return (
    <section className="space-y-5 rounded-3xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Microservice Work Order</p>
          <h3 className="mt-2 text-lg font-black text-foreground">{workOrder.issue.identifier ?? workOrder.issue.id}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{workOrder.summary}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-accent/10 px-4 py-3 text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tracked Hours</p>
          <p className="text-2xl font-black text-primary">{totalHours.toFixed(1)}h</p>
        </div>
      </div>

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

      <div className="grid gap-4 md:grid-cols-[220px,1fr]">
        <label className="space-y-2 text-sm font-bold">
          Current stage
          <select className="h-11 w-full rounded-md border border-border bg-background px-3" value={currentStage} onChange={(event) => setCurrentStage(event.target.value as MicroserviceWorkOrderStage)}>
            {STAGES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm font-bold">
            Pre-production notes
            <Textarea rows={4} value={preNotes} onChange={(event) => setPreNotes(event.target.value)} />
          </label>
          <label className="space-y-2 text-sm font-bold">
            Production notes
            <Textarea rows={4} value={productionNotes} onChange={(event) => setProductionNotes(event.target.value)} />
          </label>
          <label className="space-y-2 text-sm font-bold">
            Post-generation notes
            <Textarea rows={4} value={postNotes} onChange={(event) => setPostNotes(event.target.value)} />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <TimerReset className="mr-2 h-4 w-4" />
          Save Work Order
        </Button>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-foreground">Time Cards</h4>
            <p className="text-xs text-muted-foreground">Track pre, production, and post effort against the booked issue.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[180px,1fr,120px,1fr,160px]">
          <label className="space-y-2 text-sm font-bold">
            Phase
            <select className="h-11 w-full rounded-md border border-border bg-background px-3" value={timeCardPhase} onChange={(event) => setTimeCardPhase(event.target.value as MicroserviceWorkOrderStage)}>
              {STAGES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-bold">
            Title
            <Input value={timeCardTitle} onChange={(event) => setTimeCardTitle(event.target.value)} placeholder="Storyboard revision" />
          </label>
          <label className="space-y-2 text-sm font-bold">
            Hours
            <Input type="number" min={0.1} step={0.1} value={timeCardHours} onChange={(event) => setTimeCardHours(event.target.value)} />
          </label>
          <label className="space-y-2 text-sm font-bold">
            Notes
            <Input value={timeCardNotes} onChange={(event) => setTimeCardNotes(event.target.value)} placeholder="Client note, output, blocker" />
          </label>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!timeCardTitle.trim() || !(Number(timeCardHours) > 0) || addTimeCardMutation.isPending}
              onClick={() => addTimeCardMutation.mutate()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Time Card
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {workOrder.metadata.timeCards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tracked hours yet.</p>
          ) : (
            workOrder.metadata.timeCards.slice().reverse().map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-foreground">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">{stageLabel(entry.phase)} · {new Date(entry.recordedAt).toLocaleString()}</p>
                  {entry.notes ? <p className="mt-1 text-sm text-foreground/80">{entry.notes}</p> : null}
                </div>
                <p className="text-base font-black text-primary">{entry.hours.toFixed(1)}h</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4">
        <div>
          <h4 className="text-sm font-black text-foreground">Client Update Email</h4>
          <p className="text-xs text-muted-foreground">Send a polished AMX Air Hubs progress email for the current stage and tracked work.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm font-bold">
            Intro
            <Textarea rows={3} value={emailIntro} onChange={(event) => setEmailIntro(event.target.value)} placeholder="Here is your latest work-order update." />
          </label>
          <label className="space-y-2 text-sm font-bold">
            Next step
            <Textarea rows={3} value={emailNextStep} onChange={(event) => setEmailNextStep(event.target.value)} placeholder="Approve the production handoff by 5 PM ET." />
          </label>
          <label className="space-y-2 text-sm font-bold">
            Custom note
            <Textarea rows={3} value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} placeholder="Optional branded note for this client send." />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Sends to <span className="font-semibold text-foreground">{clientEmail || "client email required"}</span> with the current stage and logged time cards.
          </div>
          <Button disabled={!clientEmail.trim() || sendEmailMutation.isPending} onClick={() => sendEmailMutation.mutate()}>
            <Mail className="mr-2 h-4 w-4" />
            Send Client Update
          </Button>
        </div>
        {workOrder.metadata.emailLog.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Send Log</p>
            {workOrder.metadata.emailLog.slice().reverse().map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold text-foreground">{entry.subject}</p>
                  <p className="text-xs text-muted-foreground">{entry.to} · {stageLabel(entry.stage)}</p>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(entry.sentAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

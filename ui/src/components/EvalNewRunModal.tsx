import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  EVAL_TEMPLATES,
  SECTOR_LABELS,
  OPPRRC_CATEGORIES,
  OPPRRC_CATEGORY_LABELS,
  extractDriveFolderId,
  opprrPath,
  type EvalTemplate,
  type EvalSector,
  type OpprrCategory,
  type OpprrAudience,
} from "../data/evalTemplates";
import { agentsApi } from "../api/agents";
import { assetsApi } from "../api/assets";
import { useToast } from "../context/ToastContext";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Loader2,
  FileUp,
  X,
  CheckCircle2,
  FolderOpen,
  Link2,
  Sparkles,
  FolderOutput,
  Trophy,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedFile {
  file: File;
  assetId?: string;
  uploading: boolean;
  error?: string;
}

interface Agent {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
  companyId: string;
}

const SECTOR_ORDER: EvalSector[] = ["nonprofit", "civic", "chamber", "business_org", "government"];

const SECTOR_COLORS: Record<EvalSector, string> = {
  nonprofit: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  civic: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  chamber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  business_org: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  government: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fillTaskRequest(template: EvalTemplate, inputs: Record<string, string>): string {
  return template.taskRequest.replace(/\{(\w+)\}/g, (_, key) => inputs[key] ?? `[${key}]`);
}

// ─── Step 1: Template Picker ──────────────────────────────────────────────────

function TemplatePicker({
  onSelect,
}: {
  onSelect: (t: EvalTemplate) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = EVAL_TEMPLATES.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()),
  );

  const bySector = SECTOR_ORDER.reduce<Record<string, EvalTemplate[]>>((acc, sector) => {
    const items = filtered.filter((t) => t.sector === sector);
    if (items.length) acc[sector] = items;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search templates…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      <div className="overflow-y-auto space-y-5 pr-1">
        {Object.entries(bySector).map(([sector, templates]) => (
          <div key={sector}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {SECTOR_LABELS[sector as EvalSector]}
            </p>
            <div className="grid grid-cols-1 gap-2">
              {templates.map((t) => (
                <Card
                  key={t.id}
                  className="p-3 cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors"
                  onClick={() => onSelect(t)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-medium">{t.name}</span>
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] px-1.5 py-0", SECTOR_COLORS[t.sector])}
                        >
                          {SECTOR_LABELS[t.sector]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No templates match your search.</p>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Form + File Upload ───────────────────────────────────────────────

function TemplateForm({
  template,
  companyId,
  inputs,
  onInputChange,
  uploadedFiles,
  onFilesChange,
  driveFolderUrl,
  onDriveFolderChange,
  onLoadSample,
}: {
  template: EvalTemplate;
  companyId: string;
  inputs: Record<string, string>;
  onInputChange: (key: string, value: string) => void;
  uploadedFiles: Record<string, UploadedFile[]>;
  onFilesChange: (key: string, files: UploadedFile[]) => void;
  driveFolderUrl: string;
  onDriveFolderChange: (url: string) => void;
  onLoadSample: () => void;
}) {
  const driveFolderId = extractDriveFolderId(driveFolderUrl);
  const driveConnected = !!driveFolderId;

  async function handleFileChange(key: string, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const newFiles: UploadedFile[] = Array.from(fileList).map((f) => ({
      file: f,
      uploading: true,
    }));
    const existing = uploadedFiles[key] ?? [];
    onFilesChange(key, [...existing, ...newFiles]);

    // Upload each file
    const uploaded = await Promise.all(
      newFiles.map(async (uf, idx) => {
        try {
          const result = await assetsApi.uploadDocument(companyId, uf.file);
          return { ...uf, assetId: result.assetId, uploading: false };
        } catch {
          return { ...uf, uploading: false, error: "Upload failed" };
        }
      }),
    );
    onFilesChange(key, [...existing, ...uploaded]);
  }

  function removeFile(key: string, idx: number) {
    const updated = (uploadedFiles[key] ?? []).filter((_, i) => i !== idx);
    onFilesChange(key, updated);
  }

  return (
    <div className="space-y-4 pr-1">
      {/* Context banner */}
      <div className="p-2.5 rounded-md bg-muted/40 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{template.louisvilleContext}</span>
      </div>

      {/* ── Data Sources ── */}
      <div className="rounded-md border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Data Sources
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={onLoadSample}
            type="button"
          >
            <Sparkles className="h-3 w-3" />
            Load Sample Data
          </Button>
        </div>

        {/* Google Drive folder */}
        <div>
          <label className="text-[10px] font-medium text-muted-foreground block mb-1">
            Google Drive Input Folder
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={driveFolderUrl}
                onChange={(e) => onDriveFolderChange(e.target.value)}
                placeholder="Paste Google Drive folder URL…"
                className="h-8 text-xs pl-8"
              />
            </div>
            {driveConnected && (
              <Badge className="shrink-0 text-[10px] px-2 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
          {driveConnected && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Agent will pull data from this folder to auto-fill and enrich the run context.
            </p>
          )}
          {driveFolderUrl && !driveConnected && (
            <p className="text-[10px] text-destructive mt-1">
              Paste a full Google Drive folder URL (must contain /folders/)
            </p>
          )}
        </div>
      </div>

      {template.inputs.map((field) => {
        if (field.type === "file_upload") {
          const files = uploadedFiles[field.key] ?? [];
          const inputId = `eval-file-${field.key}`;
          return (
            <div key={field.key}>
              <span className="text-xs font-medium text-muted-foreground block mb-1">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </span>
              {field.hint && (
                <p className="text-[10px] text-muted-foreground mb-1.5">{field.hint}</p>
              )}
              <label
                htmlFor={inputId}
                className="border-2 border-dashed border-border rounded-md p-3 text-center cursor-pointer hover:border-primary/40 transition-colors block"
              >
                <FileUp className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">
                  Click to upload{" "}
                  <span className="text-[10px]">({field.accept ?? "PDF, CSV, TXT, MD"})</span>
                </p>
              </label>
              <input
                id={inputId}
                type="file"
                className="hidden"
                accept={field.accept}
                multiple
                onChange={(e) => handleFileChange(field.key, e.target.files)}
              />
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((uf, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1"
                    >
                      {uf.uploading ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                      ) : uf.error ? (
                        <X className="h-3 w-3 text-destructive shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                      )}
                      <span className="flex-1 truncate">{uf.file.name}</span>
                      {uf.error && <span className="text-destructive">{uf.error}</span>}
                      {!uf.uploading && (
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => removeFile(field.key, i)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        if (field.type === "select") {
          return (
            <div key={field.key}>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </label>
              <Select
                value={inputs[field.key] ?? ""}
                onValueChange={(v) => onInputChange(field.key, v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (field.type === "textarea") {
          return (
            <div key={field.key}>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </label>
              <Textarea
                value={inputs[field.key] ?? ""}
                onChange={(e) => onInputChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="text-xs"
              />
            </div>
          );
        }

        if (field.type === "date") {
          return (
            <div key={field.key}>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </label>
              <Input
                type="date"
                value={inputs[field.key] ?? ""}
                onChange={(e) => onInputChange(field.key, e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          );
        }

        // text / number
        return (
          <div key={field.key}>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </label>
            <Input
              type={field.type === "number" ? "number" : "text"}
              value={inputs[field.key] ?? ""}
              onChange={(e) => onInputChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="h-9 text-xs"
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 3: Agent + Review + Run ─────────────────────────────────────────────

function RunStep({
  template,
  inputs,
  agents,
  selectedAgentIds,
  onAgentToggle,
  outputCompany,
  onOutputCompanyChange,
  outputCategory,
  onOutputCategoryChange,
  outputAudience,
  onOutputAudienceChange,
  driveOutputUrl,
  onDriveOutputChange,
  onRun,
  isRunning,
}: {
  template: EvalTemplate;
  inputs: Record<string, string>;
  agents: Agent[];
  selectedAgentIds: string[];
  onAgentToggle: (id: string) => void;
  outputCompany: string;
  onOutputCompanyChange: (v: string) => void;
  outputCategory: OpprrCategory;
  onOutputCategoryChange: (v: OpprrCategory) => void;
  outputAudience: OpprrAudience;
  onOutputAudienceChange: (v: OpprrAudience) => void;
  driveOutputUrl: string;
  onDriveOutputChange: (v: string) => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const taskRequest = fillTaskRequest(template, inputs);
  const outputPath = opprrPath(outputCompany || "[COMPANY]", outputCategory, outputAudience);
  const driveOutputId = extractDriveFolderId(driveOutputUrl);
  const isComparison = selectedAgentIds.length > 1;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Agents
          {isComparison && (
            <Badge variant="secondary" className="ml-2 text-[9px] px-1.5 py-0 text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-900/30">
              <Trophy className="h-2.5 w-2.5 mr-0.5 inline" />
              Comparison mode — {selectedAgentIds.length} agents
            </Badge>
          )}
        </label>
        <div className="border border-border rounded-md divide-y divide-border/50 max-h-40 overflow-y-auto">
          {agents.map((a) => {
            const checked = selectedAgentIds.includes(a.id);
            return (
              <label
                key={a.id}
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/30 select-none"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onAgentToggle(a.id)}
                  className="h-3.5 w-3.5 accent-primary shrink-0"
                />
                <span className="text-xs flex-1">{a.name}</span>
                {checked && isComparison && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                    run {selectedAgentIds.indexOf(a.id) + 1}
                  </Badge>
                )}
              </label>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {isComparison
            ? "Each agent runs the same task — compare results side-by-side in Evals."
            : "Select one or more agents. Check multiple to run a comparison."}
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Task Request Preview
        </label>
        <div className="bg-muted/40 rounded-md p-3 text-xs font-mono leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
          {taskRequest}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Evaluation stages</p>
        <div className="flex flex-wrap gap-1">
          {template.stages.map((s) => (
            <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
              {s}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Approval gates</p>
        <div className="flex flex-wrap gap-1">
          {template.approvalGates.map((g) => (
            <Badge key={g} variant="secondary" className="text-[10px] px-1.5 py-0">
              {g.replaceAll("_", " ")}
            </Badge>
          ))}
        </div>
      </div>

      {/* ── Output Folder Mapping ── */}
      <div className="rounded-md border border-border p-3 space-y-3">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <FolderOutput className="h-3.5 w-3.5 text-muted-foreground" />
          Output Folder — OPPRRC
        </p>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Company</label>
            <Input
              value={outputCompany}
              onChange={(e) => onOutputCompanyChange(e.target.value)}
              placeholder="e.g. AMX-LABS"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Category</label>
            <Select value={outputCategory} onValueChange={(v) => onOutputCategoryChange(v as OpprrCategory)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPPRRC_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{OPPRRC_CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Audience</label>
            <Select value={outputAudience} onValueChange={(v) => onOutputAudienceChange(v as OpprrAudience)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOARD-INTERNAL">Board Internal</SelectItem>
                <SelectItem value="CLIENTS-EXTERNAL">Clients External</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-muted/40 rounded px-2.5 py-1.5 text-[10px] font-mono text-muted-foreground">
          {outputPath}
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">
            Google Drive Output Folder (optional)
          </label>
          <div className="relative">
            <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={driveOutputUrl}
              onChange={(e) => onDriveOutputChange(e.target.value)}
              placeholder="Paste Google Drive output folder URL…"
              className="h-8 text-xs pl-8"
            />
          </div>
          {driveOutputId && (
            <p className="text-[10px] text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Agent will push outputs to this Drive folder after completion.
            </p>
          )}
        </div>
      </div>

      <Button
        className="w-full"
        disabled={selectedAgentIds.length === 0 || isRunning}
        onClick={onRun}
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : isComparison ? (
          <Trophy className="h-4 w-4 mr-2" />
        ) : (
          <Play className="h-4 w-4 mr-2" />
        )}
        {isRunning
          ? `Starting ${isComparison ? `${selectedAgentIds.length} runs` : "run"}…`
          : isComparison
          ? `Start Comparison — ${selectedAgentIds.length} Agents`
          : "Start Eval Run"}
      </Button>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function EvalNewRunModal({ open, onClose, agents, companyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<EvalTemplate | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, UploadedFile[]>>({});
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(agents[0]?.id ? [agents[0].id] : []);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [outputCompany, setOutputCompany] = useState("AMX-LABS");
  const [outputCategory, setOutputCategory] = useState<OpprrCategory>("05_REPORTS");
  const [outputAudience, setOutputAudience] = useState<OpprrAudience>("BOARD-INTERNAL");
  const [driveOutputUrl, setDriveOutputUrl] = useState("");

  const wakeupMutation = useMutation({
    mutationFn: ({
      agentIds,
      comparisonBatchId,
      template,
      inputs,
      assetIds,
      driveFolderUrl,
      outputCompany,
      outputCategory,
      outputAudience,
      driveOutputUrl,
    }: {
      agentIds: string[];
      comparisonBatchId?: string;
      template: EvalTemplate;
      inputs: Record<string, string>;
      assetIds: string[];
      driveFolderUrl: string;
      outputCompany: string;
      outputCategory: OpprrCategory;
      outputAudience: OpprrAudience;
      driveOutputUrl: string;
    }) => {
      const taskRequest = fillTaskRequest(template, inputs);
      const outputPath = opprrPath(outputCompany, outputCategory, outputAudience);

      const enrichedTask = driveFolderUrl
        ? `${taskRequest}\n\nDATA SOURCE: Access the Google Drive folder at ${driveFolderUrl} and pull all relevant documents, data, and context to complete this request.`
        : taskRequest;

      const driveOutputId = extractDriveFolderId(driveOutputUrl);
      const pushInstruction = driveOutputId
        ? `\n\nOUTPUT DELIVERY: After completing the task, push all deliverables to the Google Drive folder at ${driveOutputUrl} and save to OPPRRC path: ${outputPath}`
        : `\n\nOUTPUT PATH: Save all deliverables to OPPRRC folder: ${outputPath}`;

      const fullTask = enrichedTask + pushInstruction;
      const payload = {
        evalTemplateId: template.id,
        templateName: template.name,
        sector: template.sector,
        inputs,
        assetIds,
        taskRequest: fullTask,
        driveFolderUrl: driveFolderUrl || null,
        driveOutputUrl: driveOutputUrl || null,
        outputPath,
        scoringWeights: template.scoringWeights,
        successCriteria: template.successCriteria,
        outputs: template.outputs,
        comparisonBatchId: comparisonBatchId ?? null,
      };

      return Promise.all(
        agentIds.map((id) =>
          agentsApi.wakeup(
            id,
            { source: "on_demand", triggerDetail: "manual", reason: `Eval: ${template.name}`, payload },
            companyId,
          ),
        ),
      );
    },
    onSuccess: (results) => {
      const anySkipped = results.some((r) => "status" in r && r.status === "skipped");
      if (anySkipped && results.length === 1) {
        pushToast({ tone: "warn", title: "Run skipped — agent may already be running" });
      } else {
        const count = results.length;
        pushToast({
          title: count > 1
            ? `${count} comparison runs started — ${selectedTemplate?.name}`
            : `Eval run started — ${selectedTemplate?.name}`,
        });
        queryClient.invalidateQueries({ queryKey: ["heartbeat-runs", companyId] });
        handleClose();
      }
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to start eval run" }),
  });

  function handleClose() {
    onClose();
    setTimeout(() => {
      setStep(1);
      setSelectedTemplate(null);
      setInputs({});
      setUploadedFiles({});
      setSelectedAgentIds(agents[0]?.id ? [agents[0].id] : []);
      setDriveFolderUrl("");
      setOutputCompany("AMX-LABS");
      setOutputCategory("05_REPORTS");
      setOutputAudience("BOARD-INTERNAL");
      setDriveOutputUrl("");
    }, 200);
  }

  function handleTemplateSelect(t: EvalTemplate) {
    setSelectedTemplate(t);
    setInputs({});
    setUploadedFiles({});
    setDriveFolderUrl("");
    setOutputCategory(t.defaultOutputCategory);
    setOutputAudience(t.defaultOutputAudience);
    setStep(2);
  }

  function handleLoadSample() {
    if (!selectedTemplate) return;
    setInputs(selectedTemplate.sampleData);
    pushToast({ title: "Sample data loaded" });
  }

  function handleInputChange(key: string, value: string) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function handleFilesChange(key: string, files: UploadedFile[]) {
    setUploadedFiles((prev) => ({ ...prev, [key]: files }));
  }

  function isStep2Valid(): boolean {
    if (!selectedTemplate) return false;
    return selectedTemplate.inputs
      .filter((f) => f.required && f.type !== "file_upload")
      .every((f) => (inputs[f.key] ?? "").trim().length > 0);
  }

  function allUploadsComplete(): boolean {
    return Object.values(uploadedFiles)
      .flat()
      .every((f) => !f.uploading);
  }

  function handleAgentToggle(id: string) {
    setSelectedAgentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleRun() {
    if (!selectedTemplate || selectedAgentIds.length === 0) return;
    const assetIds = Object.values(uploadedFiles)
      .flat()
      .filter((f) => f.assetId)
      .map((f) => f.assetId!);
    const comparisonBatchId = selectedAgentIds.length > 1 ? crypto.randomUUID() : undefined;
    wakeupMutation.mutate({
      agentIds: selectedAgentIds,
      comparisonBatchId,
      template: selectedTemplate,
      inputs,
      assetIds,
      driveFolderUrl,
      outputCompany,
      outputCategory,
      outputAudience,
      driveOutputUrl,
    });
  }

  const stepTitles: Record<number, string> = {
    1: "Choose a Template",
    2: "Fill in Details",
    3: "Review & Run",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <DialogTitle className="text-sm">{stepTitles[step]}</DialogTitle>
            <div className="ml-auto flex items-center gap-1">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className={cn(
                    "h-1.5 w-6 rounded-full transition-colors",
                    n <= step ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </div>
          </div>
          {selectedTemplate && step > 1 && (
            <p className="text-xs text-muted-foreground mt-1">{selectedTemplate.name}</p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto mt-4 pr-1">
          {step === 1 && <TemplatePicker onSelect={handleTemplateSelect} />}

          {step === 2 && selectedTemplate && (
            <TemplateForm
              template={selectedTemplate}
              companyId={companyId}
              inputs={inputs}
              onInputChange={handleInputChange}
              uploadedFiles={uploadedFiles}
              onFilesChange={handleFilesChange}
              driveFolderUrl={driveFolderUrl}
              onDriveFolderChange={setDriveFolderUrl}
              onLoadSample={handleLoadSample}
            />
          )}

          {step === 3 && selectedTemplate && (
            <RunStep
              template={selectedTemplate}
              inputs={inputs}
              agents={agents}
              selectedAgentIds={selectedAgentIds}
              onAgentToggle={handleAgentToggle}
              outputCompany={outputCompany}
              onOutputCompanyChange={setOutputCompany}
              outputCategory={outputCategory}
              onOutputCategoryChange={setOutputCategory}
              outputAudience={outputAudience}
              onOutputAudienceChange={setOutputAudience}
              driveOutputUrl={driveOutputUrl}
              onDriveOutputChange={setDriveOutputUrl}
              onRun={handleRun}
              isRunning={wakeupMutation.isPending}
            />
          )}
        </div>

        {step === 2 && (
          <div className="shrink-0 pt-4 border-t border-border flex justify-end">
            <Button
              size="sm"
              disabled={!isStep2Valid() || !allUploadsComplete()}
              onClick={() => setStep(3)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

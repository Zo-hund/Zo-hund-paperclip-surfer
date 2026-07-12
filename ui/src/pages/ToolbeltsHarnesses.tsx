import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  toolbeltsApi,
  harnessesApi,
  type Toolbelt,
  type Harness,
  type ToolbeltWriteRequest,
  type HarnessWriteRequest,
} from "../api/toolbelts";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Wrench, Layers, Plus, Pencil, Globe } from "lucide-react";

const CATEGORY_OPTIONS = ["general", "devsecops", "creative", "research", "ops", "custom"];

interface ToolbeltFormState {
  key: string;
  name: string;
  description: string;
  category: string;
  toolPermissions: string;
  isPublic: boolean;
}

const emptyToolbeltForm: ToolbeltFormState = {
  key: "",
  name: "",
  description: "",
  category: "general",
  toolPermissions: "",
  isPublic: false,
};

interface HarnessFormState {
  key: string;
  name: string;
  description: string;
  category: string;
  adapterType: string;
  model: string;
  toolbeltId: string;
  guardrails: string;
  isPublic: boolean;
}

const emptyHarnessForm: HarnessFormState = {
  key: "",
  name: "",
  description: "",
  category: "general",
  adapterType: "openrouter",
  model: "openrouter/auto",
  toolbeltId: "",
  guardrails: "",
  isPublic: false,
};

function parsePermissions(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseGuardrails(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * ToolbeltsHarnesses — company-scoped (and, via `mode="instance"`, instance
 * preset) management page for the Skills/Toolbelts/Harnesses directory
 * taxonomy. Company mode lists the company's own bundles plus public
 * instance-wide presets (read-only badge); instance mode manages presets
 * directly (companyId = null rows) and additionally exposes an "isPublic"
 * toggle, since that's what controls whether a preset is offered to every
 * company.
 */
export function ToolbeltsHarnesses({ mode = "company" }: { mode?: "company" | "instance" }) {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const isInstance = mode === "instance";

  const [toolbeltDialogOpen, setToolbeltDialogOpen] = useState(false);
  const [editingToolbelt, setEditingToolbelt] = useState<Toolbelt | null>(null);
  const [toolbeltForm, setToolbeltForm] = useState<ToolbeltFormState>(emptyToolbeltForm);

  const [harnessDialogOpen, setHarnessDialogOpen] = useState(false);
  const [editingHarness, setEditingHarness] = useState<Harness | null>(null);
  const [harnessForm, setHarnessForm] = useState<HarnessFormState>(emptyHarnessForm);

  useEffect(() => {
    setBreadcrumbs([{ label: isInstance ? "Toolbelts & Harnesses" : "Toolbelts & Harnesses" }]);
  }, [setBreadcrumbs, isInstance]);

  const toolbeltsQuery = useQuery({
    queryKey: isInstance ? queryKeys.toolbelts.instance : queryKeys.toolbelts.list(companyId),
    queryFn: () => (isInstance ? toolbeltsApi.listInstance() : toolbeltsApi.list(companyId)),
    enabled: isInstance || Boolean(companyId),
  });

  const harnessesQuery = useQuery({
    queryKey: isInstance ? queryKeys.harnesses.instance : queryKeys.harnesses.list(companyId),
    queryFn: () => (isInstance ? harnessesApi.listInstance() : harnessesApi.list(companyId)),
    enabled: isInstance || Boolean(companyId),
  });

  const createToolbelt = useMutation({
    mutationFn: (data: ToolbeltWriteRequest) =>
      isInstance ? toolbeltsApi.createInstance(data) : toolbeltsApi.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: isInstance ? queryKeys.toolbelts.instance : queryKeys.toolbelts.list(companyId),
      });
      pushToast({ title: "Toolbelt created" });
      closeToolbeltDialog();
    },
    onError: (error) =>
      pushToast({
        tone: "warn",
        title: "Failed to create toolbelt",
        body: error instanceof Error ? error.message : undefined,
      }),
  });

  const updateToolbelt = useMutation({
    mutationFn: ({ toolbeltId, data }: { toolbeltId: string; data: ToolbeltWriteRequest }) =>
      isInstance
        ? toolbeltsApi.updateInstance(toolbeltId, data)
        : toolbeltsApi.update(companyId, toolbeltId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: isInstance ? queryKeys.toolbelts.instance : queryKeys.toolbelts.list(companyId),
      });
      pushToast({ title: "Toolbelt updated" });
      closeToolbeltDialog();
    },
    onError: (error) =>
      pushToast({
        tone: "warn",
        title: "Failed to update toolbelt",
        body: error instanceof Error ? error.message : undefined,
      }),
  });

  const createHarness = useMutation({
    mutationFn: (data: HarnessWriteRequest) =>
      isInstance ? harnessesApi.createInstance(data) : harnessesApi.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: isInstance ? queryKeys.harnesses.instance : queryKeys.harnesses.list(companyId),
      });
      pushToast({ title: "Harness created" });
      closeHarnessDialog();
    },
    onError: (error) =>
      pushToast({
        tone: "warn",
        title: "Failed to create harness",
        body: error instanceof Error ? error.message : undefined,
      }),
  });

  const updateHarness = useMutation({
    mutationFn: ({ harnessId, data }: { harnessId: string; data: HarnessWriteRequest }) =>
      isInstance
        ? harnessesApi.updateInstance(harnessId, data)
        : harnessesApi.update(companyId, harnessId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: isInstance ? queryKeys.harnesses.instance : queryKeys.harnesses.list(companyId),
      });
      pushToast({ title: "Harness updated" });
      closeHarnessDialog();
    },
    onError: (error) =>
      pushToast({
        tone: "warn",
        title: "Failed to update harness",
        body: error instanceof Error ? error.message : undefined,
      }),
  });

  const toolbelts = toolbeltsQuery.data ?? [];
  const harnesses = harnessesQuery.data ?? [];

  function openCreateToolbelt() {
    setEditingToolbelt(null);
    setToolbeltForm(emptyToolbeltForm);
    setToolbeltDialogOpen(true);
  }

  function openEditToolbelt(toolbelt: Toolbelt) {
    setEditingToolbelt(toolbelt);
    setToolbeltForm({
      key: toolbelt.key,
      name: toolbelt.name,
      description: toolbelt.description ?? "",
      category: toolbelt.category,
      toolPermissions: toolbelt.toolPermissions.join("\n"),
      isPublic: toolbelt.isPublic,
    });
    setToolbeltDialogOpen(true);
  }

  function closeToolbeltDialog() {
    setToolbeltDialogOpen(false);
    setEditingToolbelt(null);
    setToolbeltForm(emptyToolbeltForm);
  }

  function handleSaveToolbelt() {
    const payload: ToolbeltWriteRequest = {
      key: toolbeltForm.key.trim(),
      name: toolbeltForm.name.trim(),
      description: toolbeltForm.description.trim() || null,
      category: toolbeltForm.category,
      toolPermissions: parsePermissions(toolbeltForm.toolPermissions),
      ...(isInstance ? { isPublic: toolbeltForm.isPublic } : {}),
    };
    if (editingToolbelt) {
      updateToolbelt.mutate({ toolbeltId: editingToolbelt.id, data: payload });
    } else {
      createToolbelt.mutate(payload);
    }
  }

  function openCreateHarness() {
    setEditingHarness(null);
    setHarnessForm(emptyHarnessForm);
    setHarnessDialogOpen(true);
  }

  function openEditHarness(harness: Harness) {
    setEditingHarness(harness);
    setHarnessForm({
      key: harness.key,
      name: harness.name,
      description: harness.description ?? "",
      category: harness.category,
      adapterType: harness.adapterType,
      model: harness.model,
      toolbeltId: harness.toolbeltId ?? "",
      guardrails: Object.keys(harness.guardrails ?? {}).length > 0
        ? JSON.stringify(harness.guardrails, null, 2)
        : "",
      isPublic: harness.isPublic,
    });
    setHarnessDialogOpen(true);
  }

  function closeHarnessDialog() {
    setHarnessDialogOpen(false);
    setEditingHarness(null);
    setHarnessForm(emptyHarnessForm);
  }

  const [harnessFormError, setHarnessFormError] = useState<string | null>(null);

  function handleSaveHarness() {
    const guardrails = parseGuardrails(harnessForm.guardrails);
    if (guardrails === null) {
      setHarnessFormError("Guardrails must be valid JSON (an object).");
      return;
    }
    setHarnessFormError(null);
    const payload: HarnessWriteRequest = {
      key: harnessForm.key.trim(),
      name: harnessForm.name.trim(),
      description: harnessForm.description.trim() || null,
      category: harnessForm.category,
      adapterType: harnessForm.adapterType.trim(),
      model: harnessForm.model.trim(),
      toolbeltId: harnessForm.toolbeltId || null,
      guardrails,
      ...(isInstance ? { isPublic: harnessForm.isPublic } : {}),
    };
    if (editingHarness) {
      updateHarness.mutate({ harnessId: editingHarness.id, data: payload });
    } else {
      createHarness.mutate(payload);
    }
  }

  const isSavingToolbelt = createToolbelt.isPending || updateToolbelt.isPending;
  const isSavingHarness = createHarness.isPending || updateHarness.isPending;

  if (!isInstance && !companyId) return null;
  if (toolbeltsQuery.isLoading || harnessesQuery.isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Toolbelts &amp; Harnesses</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isInstance
            ? "Manage instance-wide toolbelt and harness presets available to every company."
            : "Named tool bundles (toolbelts) and full agent execution profiles (harnesses) your agents can reference."}
        </p>
      </div>

      {/* Toolbelts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Toolbelts</h2>
          </div>
          <Button size="sm" onClick={openCreateToolbelt}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Toolbelt
          </Button>
        </div>

        {toolbelts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border rounded-lg">
            <Wrench className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No toolbelts yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {toolbelts.map((toolbelt) => {
              const isPreset = toolbelt.companyId === null;
              const editable = isInstance ? isPreset : !isPreset;
              return (
                <Card key={toolbelt.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium truncate">{toolbelt.name}</h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {toolbelt.category}
                        </Badge>
                        {isPreset && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                            <Globe className="h-2.5 w-2.5" />
                            instance preset
                          </Badge>
                        )}
                        {toolbelt.isPublic && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            public
                          </Badge>
                        )}
                      </div>
                      {toolbelt.description && (
                        <p className="text-xs text-muted-foreground mt-1">{toolbelt.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-1 font-mono">{toolbelt.key}</p>
                      {toolbelt.toolPermissions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {toolbelt.toolPermissions.map((perm) => (
                            <span
                              key={perm}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => openEditToolbelt(toolbelt)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Harnesses */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Harnesses</h2>
          </div>
          <Button size="sm" onClick={openCreateHarness}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Harness
          </Button>
        </div>

        {harnesses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-border rounded-lg">
            <Layers className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No harnesses yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {harnesses.map((harness) => {
              const isPreset = harness.companyId === null;
              const editable = isInstance ? isPreset : !isPreset;
              const linkedToolbelt = toolbelts.find((t) => t.id === harness.toolbeltId);
              return (
                <Card key={harness.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium truncate">{harness.name}</h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {harness.category}
                        </Badge>
                        {isPreset && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                            <Globe className="h-2.5 w-2.5" />
                            instance preset
                          </Badge>
                        )}
                        {harness.isPublic && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            public
                          </Badge>
                        )}
                      </div>
                      {harness.description && (
                        <p className="text-xs text-muted-foreground mt-1">{harness.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
                        {harness.key} &middot; {harness.adapterType} &middot; {harness.model}
                      </p>
                      {linkedToolbelt && (
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                          <Wrench className="h-3 w-3" />
                          {linkedToolbelt.name}
                        </div>
                      )}
                    </div>
                    {editable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => openEditHarness(harness)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Toolbelt dialog */}
      <Dialog open={toolbeltDialogOpen} onOpenChange={(open) => !open && closeToolbeltDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingToolbelt ? "Edit Toolbelt" : "New Toolbelt"}</DialogTitle>
            <DialogDescription>
              A named, reusable bundle of tool permissions a harness can be granted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Key</label>
              <Input
                value={toolbeltForm.key}
                onChange={(e) => setToolbeltForm({ ...toolbeltForm, key: e.target.value })}
                placeholder="devsecops"
                className="font-mono text-sm"
                disabled={Boolean(editingToolbelt)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={toolbeltForm.name}
                onChange={(e) => setToolbeltForm({ ...toolbeltForm, name: e.target.value })}
                placeholder="DevSecOps"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={toolbeltForm.description}
                onChange={(e) => setToolbeltForm({ ...toolbeltForm, description: e.target.value })}
                rows={2}
                placeholder="What is this toolbelt for?"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              <Select
                value={toolbeltForm.category}
                onValueChange={(v) => setToolbeltForm({ ...toolbeltForm, category: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Tool permissions (one per line, or comma-separated)
              </label>
              <Textarea
                value={toolbeltForm.toolPermissions}
                onChange={(e) => setToolbeltForm({ ...toolbeltForm, toolPermissions: e.target.value })}
                rows={4}
                className="font-mono text-sm"
                placeholder={"Bash\nRead\nEdit\nmcp__security__scan"}
              />
            </div>
            {isInstance && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="toolbelt-public"
                  checked={toolbeltForm.isPublic}
                  onCheckedChange={(next) => setToolbeltForm({ ...toolbeltForm, isPublic: next === true })}
                />
                <label htmlFor="toolbelt-public" className="text-xs text-muted-foreground">
                  Public — offered as a preset to every company
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeToolbeltDialog} disabled={isSavingToolbelt}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveToolbelt}
              disabled={!toolbeltForm.key.trim() || !toolbeltForm.name.trim() || isSavingToolbelt}
            >
              {isSavingToolbelt ? "Saving..." : editingToolbelt ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Harness dialog */}
      <Dialog open={harnessDialogOpen} onOpenChange={(open) => !open && closeHarnessDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingHarness ? "Edit Harness" : "New Harness"}</DialogTitle>
            <DialogDescription>
              A full agent execution profile: adapter/model choice, an optional toolbelt, and guardrails.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Key</label>
              <Input
                value={harnessForm.key}
                onChange={(e) => setHarnessForm({ ...harnessForm, key: e.target.value })}
                placeholder="devsecops-engineer"
                className="font-mono text-sm"
                disabled={Boolean(editingHarness)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={harnessForm.name}
                onChange={(e) => setHarnessForm({ ...harnessForm, name: e.target.value })}
                placeholder="DevSecOps Engineer"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={harnessForm.description}
                onChange={(e) => setHarnessForm({ ...harnessForm, description: e.target.value })}
                rows={2}
                placeholder="What is this harness for?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select
                  value={harnessForm.category}
                  onValueChange={(v) => setHarnessForm({ ...harnessForm, category: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Toolbelt</label>
                <Select
                  value={harnessForm.toolbeltId || "__none__"}
                  onValueChange={(v) => setHarnessForm({ ...harnessForm, toolbeltId: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {toolbelts.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Adapter type</label>
                <Input
                  value={harnessForm.adapterType}
                  onChange={(e) => setHarnessForm({ ...harnessForm, adapterType: e.target.value })}
                  placeholder="openrouter"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Model</label>
                <Input
                  value={harnessForm.model}
                  onChange={(e) => setHarnessForm({ ...harnessForm, model: e.target.value })}
                  placeholder="openrouter/auto"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Guardrails (JSON)</label>
              <Textarea
                value={harnessForm.guardrails}
                onChange={(e) => setHarnessForm({ ...harnessForm, guardrails: e.target.value })}
                rows={4}
                className="font-mono text-sm"
                placeholder={'{\n  "maxTurns": 50\n}'}
              />
              {harnessFormError && <p className="text-xs text-destructive mt-1">{harnessFormError}</p>}
            </div>
            {isInstance && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="harness-public"
                  checked={harnessForm.isPublic}
                  onCheckedChange={(next) => setHarnessForm({ ...harnessForm, isPublic: next === true })}
                />
                <label htmlFor="harness-public" className="text-xs text-muted-foreground">
                  Public — offered as a preset to every company
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeHarnessDialog} disabled={isSavingHarness}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveHarness}
              disabled={!harnessForm.key.trim() || !harnessForm.name.trim() || isSavingHarness}
            >
              {isSavingHarness ? "Saving..." : editingHarness ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

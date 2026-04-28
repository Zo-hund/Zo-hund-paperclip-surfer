import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentMemoriesApi, type AgentMemory, type AgentMemoryCreateRequest } from "../api/agentMemories";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Brain, Plus, Pencil, Trash2, Globe, FolderOpen, Search, SlidersHorizontal, Loader2,
} from "lucide-react";
import { amxApi } from "@/api/amx";
import { agentsApi } from "../api/agents";

const CATEGORIES = ["pattern", "preference", "decision", "learning", "feedback"] as const;
const SOURCES = ["self", "ceo", "board", "human"] as const;

const categoryColors: Record<string, string> = {
  pattern:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  preference: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  decision:   "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  learning:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  feedback:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const sourceColors: Record<string, string> = {
  self:  "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  ceo:   "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  board: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  human: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

interface MemoryFormState {
  agentId: string;
  title: string;
  content: string;
  scope: "global" | "project";
  category: AgentMemory["category"];
  source: AgentMemory["source"];
  confidence: number;
}

const emptyForm: MemoryFormState = {
  agentId: "",
  title: "",
  content: "",
  scope: "global",
  category: "learning",
  source: "board",
  confidence: 0.8,
};

export function Memories() {
  const { selectedCompanyId: companyId } = useCompany();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ agentId: string; memoryId: string } | null>(null);
  const [form, setForm] = useState<MemoryFormState>(emptyForm);

  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(companyId!),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });

  const agents = agentsQuery.data ?? [];

  // Fetch memories for all agents in parallel
  const memoriesQueries = agents.map((agent) => ({
    agentId: agent.id,
    agentName: agent.name,
    query: queryKeys.agentMemories.list(agent.id),
  }));

  const allMemoriesQuery = useQuery({
    queryKey: ["company-memories", companyId],
    queryFn: () => amxApi.getMemories(companyId!),
    enabled: !!companyId,
  });

  const allMemories: (AgentMemory & { agentName?: string })[] = allMemoriesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: { agentId: string; payload: AgentMemoryCreateRequest }) =>
      agentMemoriesApi.create(data.agentId, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-memories"] });
      pushToast({ title: "Memory created" });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to create memory" }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ agentId, memoryId }: { agentId: string; memoryId: string }) =>
      agentMemoriesApi.delete(agentId, memoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-memories"] });
      pushToast({ title: "Memory deleted" });
      setDeleteConfirm(null);
    },
    onError: () => pushToast({ tone: "warn", title: "Failed to delete memory" }),
  });

  const filtered = allMemories.filter((m) => {
    const matchSearch = !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase()) || m.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = filterCategory === "all" || m.category === filterCategory;
    const matchScope = filterScope === "all" || m.scope === filterScope;
    return matchSearch && matchCat && matchScope;
  });

  const globalCount = filtered.filter((m) => m.scope === "global").length;
  const projectCount = filtered.filter((m) => m.scope === "project").length;

  function handleSave() {
    if (!form.agentId) {
      pushToast({ tone: "warn", title: "Select an agent" });
      return;
    }
    createMutation.mutate({
      agentId: form.agentId,
      payload: {
        title: form.title,
        content: form.content,
        scope: form.scope,
        projectId: null,
        category: form.category,
        source: form.source,
        confidence: form.confidence,
      },
    });
  }

  if (!companyId) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Institutional Memory</h1>
            <p className="text-xs text-muted-foreground">
              {allMemories.length} total memories across {agents.length} agents
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Memory
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border/50 shrink-0 bg-accent/5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SlidersHorizontal className="h-3 w-3 mr-1.5" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterScope} onValueChange={setFilterScope}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="global">Global</SelectItem>
            <SelectItem value="project">Project</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
          <Globe className="h-3.5 w-3.5" />
          <span>{globalCount} global</span>
          <FolderOpen className="h-3.5 w-3.5 ml-2" />
          <span>{projectCount} project</span>
        </div>
      </div>

      {/* Memory List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {allMemoriesQuery.isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Brain className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">No memories found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {allMemories.length === 0 ? "Add memories to help agents learn and improve." : "Try adjusting your filters."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((memory) => (
              <Card key={memory.id} className="p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-sm font-medium truncate">{memory.title}</h3>
                      <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", categoryColors[memory.category])}>
                        {memory.category}
                      </Badge>
                      <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", sourceColors[memory.source])}>
                        {memory.source}
                      </Badge>
                      {memory.scope === "project" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          <FolderOpen className="h-2.5 w-2.5 mr-1" />project
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{memory.content}</p>
                    <div className="flex items-center gap-4">
                      {memory.agentName && (
                        <span className="text-[11px] text-muted-foreground font-medium">
                          Agent: {memory.agentName}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${memory.confidence * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{Math.round(memory.confidence * 100)}%</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive shrink-0"
                    onClick={() => setDeleteConfirm({ agentId: memory.agentId, memoryId: memory.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Institutional Memory</DialogTitle>
            <DialogDescription>Create a memory entry for an agent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Agent</label>
              <Select value={form.agentId} onValueChange={(v) => setForm({ ...form, agentId: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Memory title"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Describe the memory..."
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as AgentMemory["category"] })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Source</label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as AgentMemory["source"] })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Confidence ({Math.round(form.confidence * 100)}%)
              </label>
              <input
                type="range" min={0} max={1} step={0.05}
                value={form.confidence}
                onChange={(e) => setForm({ ...form, confidence: parseFloat(e.target.value) })}
                className="w-full mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!form.title.trim() || !form.content.trim() || !form.agentId || createMutation.isPending}
            >
              {createMutation.isPending ? "Saving..." : "Create Memory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Memory</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

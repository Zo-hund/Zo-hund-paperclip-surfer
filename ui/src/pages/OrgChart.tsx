import * as React from "react";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { Download, Network, Upload, Zap, UserCheck, Maximize2, Minimize2 } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import { extractModelName } from "../lib/model-utils";
import { useDialog } from "../context/DialogContext";

// Layout constants
const CARD_W = 200;
const CARD_H = 100;
const GAP_X = 32;
const GAP_Y = 80;
const PADDING = 60;

// ── Tree layout types ───────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  x: number;
  y: number;
  children: LayoutNode[];
}

// ── Layout algorithm ────────────────────────────────────────────────────

/** Compute the width each subtree needs. */
function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

/** Recursively assign x,y positions. */
function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.reports) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + CARD_H + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    x: x + (totalW - CARD_W) / 2,
    y,
    children: layoutChildren,
  };
}

/** Layout all root nodes side by side. */
function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];

  const totalW = roots.reduce((sum, r) => sum + subtreeWidth(r), 0);
  const gaps = (roots.length - 1) * GAP_X;
  let x = PADDING;
  const y = PADDING;

  const result: LayoutNode[] = [];
  for (const root of roots) {
    const w = subtreeWidth(root);
    result.push(layoutTree(root, x, y));
    x += w + GAP_X;
  }

  // Compute bounds and return
  return result;
}

/** Flatten layout tree to list of nodes. */
function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Collect all parent→child edges. */
function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

// ── Status dot colors (raw hex for SVG) ─────────────────────────────────

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  gemini_local: "Gemini",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  hermes_local: "Hermes",
  openclaw_gateway: "OpenClaw Gateway",
  process: "Process",
  http: "HTTP",
};

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
};
const defaultDotColor = "#a3a3a3";

// ── Main component ──────────────────────────────────────────────────────

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  React.useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart" }]);
  }, [setBreadcrumbs]);

  // Fetch live runs for the company to show active connections
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 3000,
  });

  const activeAgentIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.status === "running" || run.status === "queued") {
        ids.add(run.agentId);
      }
    }
    return ids;
  }, [liveRuns]);

  // Layout computation
  const layout = React.useMemo(() => layoutForest(orgTree ?? []), [orgTree]);
  const allNodes = React.useMemo(() => flattenLayout(layout), [layout]);
  const edges = React.useMemo(() => collectEdges(layout), [layout]);

  // Compute SVG bounds
  const bounds = React.useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  const { openSwarmLauncher } = useDialog();

  // Pan & zoom state
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });

  const MODEL_ICONS: Record<string, string> = {
    "claude-local": "claude_brand_icon_1775315332265.png",
    "codex-local": "gpt4_brand_icon_1775315349043.png",
    "gemini-local": "gemini_brand_icon_1775315361793.png",
  };
  const [zoom, setZoom] = React.useState(1);
  const [dragging, setDragging] = React.useState(false);
  const dragStart = React.useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [fullscreen, setFullscreen] = React.useState(false);

  // Center the chart on first load — retry until container has real dimensions (mobile fix)
  const hasInitialized = React.useRef(false);
  // Re-fit whenever fullscreen changes
  React.useEffect(() => {
    hasInitialized.current = false;
  }, [fullscreen]);
  React.useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;

    const tryFit = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;

      // Container not laid out yet (mobile flex-1 collapse) — retry next frame
      if (containerW === 0 || containerH === 0) {
        requestAnimationFrame(tryFit);
        return;
      }

      hasInitialized.current = true;
      const scaleX = (containerW - 40) / bounds.width;
      const scaleY = (containerH - 40) / bounds.height;
      const fitZoom = Math.min(scaleX, scaleY, 1);
      const chartW = bounds.width * fitZoom;
      const chartH = bounds.height * fitZoom;
      setZoom(fitZoom);
      setPan({ x: (containerW - chartW) / 2, y: (containerH - chartH) / 2 });
    };

    tryFit();
  }, [allNodes, bounds]);

  const lastTouchDist = React.useRef<number | null>(null);

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Don't drag if clicking a card
    const target = e.target as HTMLElement;
    if (target.closest("[data-org-card]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const target = e.touches[0].target as HTMLElement;
      if (target.closest("[data-org-card]")) return;
      const t = e.touches[0];
      setDragging(true);
      dragStart.current = { x: t.clientX, y: t.clientY, panX: pan.x, panY: pan.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
    }
  }, [pan]);

  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && dragging) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
    } else if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / lastTouchDist.current;
      const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const px = cx - rect.left;
        const py = cy - rect.top;
        const scale = newZoom / zoom;
        setPan({ x: px - scale * (px - pan.x), y: py - scale * (py - pan.y) });
      }
      setZoom(newZoom);
      lastTouchDist.current = dist;
    }
  }, [dragging, zoom, pan]);

  const handleTouchEnd = React.useCallback(() => {
    setDragging(false);
    lastTouchDist.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);

    // Zoom toward mouse position
    const scale = newZoom / zoom;
    setPan({
      x: mouseX - scale * (mouseX - pan.x),
      y: mouseY - scale * (mouseY - pan.y),
    });
    setZoom(newZoom);
  }, [zoom, pan]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a company to view the org chart." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (orgTree && orgTree.length === 0) {
    return <EmptyState icon={Network} message="No organizational hierarchy defined." />;
  }

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 flex flex-col bg-background" : "flex flex-col h-full overflow-hidden"}>
      <style>{`
        @keyframes orbit-pulse {
          0%   { outline-color: rgba(34, 211, 238, 0.7); outline-offset: 0px; }
          70%  { outline-color: rgba(34, 211, 238, 0);   outline-offset: 6px; }
          100% { outline-color: rgba(34, 211, 238, 0);   outline-offset: 0px; }
        }
        @keyframes orbit-pulse-queued {
          0%   { outline-color: rgba(250, 204, 21, 0.7); outline-offset: 0px; }
          70%  { outline-color: rgba(250, 204, 21, 0);   outline-offset: 6px; }
          100% { outline-color: rgba(250, 204, 21, 0);   outline-offset: 0px; }
        }
        @keyframes dash-flow {
          to { stroke-dashoffset: -20; }
        }
        .active-node-running {
          animation: orbit-pulse 2s infinite;
          outline: 1.5px solid rgba(34, 211, 238, 0.7);
          will-change: outline-color, outline-offset;
        }
        .active-node-queued {
          animation: orbit-pulse-queued 2s infinite;
          outline: 1.5px solid rgba(250, 204, 21, 0.7);
          will-change: outline-color, outline-offset;
        }
        .active-edge-flow {
          stroke-dasharray: 5, 5;
          animation: dash-flow 1s linear infinite;
          stroke: #22d3ee !important;
          stroke-width: 2 !important;
        }
        .active-edge-flow-queued {
          stroke-dasharray: 5, 5;
          animation: dash-flow 1.5s linear infinite;
          stroke: #facc15 !important;
          stroke-width: 2 !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .active-node-running, .active-node-queued { animation: none; }
          .active-edge-flow, .active-edge-flow-queued { animation: none; stroke-dasharray: none; }
        }
      `}</style>
      <div className="mb-2 flex items-center justify-start gap-2 shrink-0 px-1">
        <Link to="/company/import">
          <Button variant="outline" size="sm">
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import company
          </Button>
        </Link>
        <Link to="/company/export">
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export company
          </Button>
        </Link>
      </div>
    <div
      ref={containerRef}
      className="w-full flex-1 min-h-0 overflow-hidden relative bg-muted/20 border border-border rounded-lg"
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button
          className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
          onClick={() => {
            const newZoom = Math.min(zoom * 1.2, 2);
            const container = containerRef.current;
            if (container) {
              const cx = container.clientWidth / 2;
              const cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
            }
            setZoom(newZoom);
          }}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors"
          onClick={() => {
            const newZoom = Math.max(zoom * 0.8, 0.2);
            const container = containerRef.current;
            if (container) {
              const cx = container.clientWidth / 2;
              const cy = container.clientHeight / 2;
              const scale = newZoom / zoom;
              setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
            }
            setZoom(newZoom);
          }}
          aria-label="Zoom out"
        >
          &minus;
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-[10px] hover:bg-accent transition-colors"
          onClick={() => {
            if (!containerRef.current) return;
            const cW = containerRef.current.clientWidth;
            const cH = containerRef.current.clientHeight;
            const scaleX = (cW - 40) / bounds.width;
            const scaleY = (cH - 40) / bounds.height;
            const fitZoom = Math.min(scaleX, scaleY, 1);
            const chartW = bounds.width * fitZoom;
            const chartH = bounds.height * fitZoom;
            setZoom(fitZoom);
            setPan({ x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
          }}
          title="Fit to screen"
          aria-label="Fit chart to screen"
        >
          Fit
        </button>
        <button
          className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded hover:bg-accent transition-colors"
          onClick={() => setFullscreen(f => !f)}
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fullscreen
            ? <Minimize2 className="w-3.5 h-3.5" />
            : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Swarm launcher button */}
      <div className="absolute bottom-8 right-8 z-50">
        <Button
          size="lg"
          className="rounded-full h-16 w-16 shadow-2xl transition-all duration-300 bg-card text-foreground border border-border/60 ring-4 ring-transparent ring-offset-2 shadow-black/10 hover:scale-105 hover:ring-primary/30"
          title="Launch Swarm"
          onClick={openSwarmLauncher}
        >
          <Zap className="h-8 w-8 text-muted-foreground" />
        </Button>
      </div>

      {/* SVG layer for edges */}
      <style>{`
        @keyframes swarm-flow {
          from { stroke-dashoffset: 100; }
          to { stroke-dashoffset: 0; }
        }
        .active-edge-swarm {
          stroke: var(--primary) !important;
          stroke-width: 3 !important;
          stroke-dasharray: 8 4 !important;
          animation: swarm-flow 0.5s linear infinite !important;
          filter: drop-shadow(0 0 8px var(--primary));
        }
      `}</style>
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{
          width: "100%",
          height: "100%",
        }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {edges.map(({ parent, child }) => {
            const x1 = parent.x + CARD_W / 2;
            const y1 = parent.y + CARD_H;
            const x2 = child.x + CARD_W / 2;
            const y2 = child.y;
            const midY = (y1 + y2) / 2;

            const isActive = activeAgentIds.has(child.id);
            const run = liveRuns?.find(r => r.agentId === child.id && (r.status === "running" || r.status === "queued"));
            const runStatus = run?.status;

            return (
              <path
                key={`${parent.id}-${child.id}`}
                d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={1.5}
                className={`${isActive ? (runStatus === "running" ? "active-edge-flow" : "active-edge-flow-queued") : ""}`}
              />
            );
          })}
        </g>
      </svg>

      {/* Card layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {allNodes.map((node) => {
          const agent = agentMap.get(node.id);
          const dotColor = statusDotColor[node.status] ?? defaultDotColor;

          const run = liveRuns?.find(r => r.agentId === node.id && (r.status === "running" || r.status === "queued"));
          const runStatus = run?.status;

          return (
            <div
              key={node.id}
              data-org-card
              className={`absolute bg-card border border-border rounded-lg shadow-sm hover:shadow-md hover:border-foreground/20 transition-[box-shadow,border-color] duration-150 cursor-pointer select-none
                ${runStatus ? (runStatus === "running" ? "active-node-running" : "active-node-queued") : ""}
              `}
              style={{
                left: node.x,
                top: node.y,
                width: CARD_W,
                minHeight: CARD_H,
              }}
              onClick={() => navigate(agent ? agentUrl(agent) : `/agents/${node.id}`)}
            >
              <div className="flex items-center px-4 py-3 gap-3">
                {/* Agent icon + status dot */}
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-300 bg-muted">
                    {agent && MODEL_ICONS[agent.adapterType] ? (
                      <img src={MODEL_ICONS[agent.adapterType]} alt={agent.adapterType} className="w-full h-full object-cover" />
                    ) : (
                      <AgentIcon icon={agent?.icon} className="h-5 w-5 text-foreground/70" />
                    )}
                  </div>
                  <span
                    className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background"
                    style={{ backgroundColor: dotColor }}
                  />
                  {(node.name.toLowerCase().includes("human") || node.role.toLowerCase().includes("lead")) && (
                    <div className="absolute -top-2 -left-2 bg-emerald-500 text-white rounded-full p-1 shadow-lg animate-bounce duration-500">
                      <UserCheck className="h-2.5 w-2.5" />
                    </div>
                  )}
                </div>
                {/* Name + role + adapter type */}
                <div className="flex flex-col items-start min-w-0 flex-1">
                  <span className="text-sm font-semibold text-foreground leading-tight">
                    {node.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {agent?.title ?? roleLabel(node.role)}
                  </span>
                  {agent && (
                    <span className="text-[10px] text-muted-foreground/60 font-mono leading-tight mt-1">
                      {adapterLabels[agent.adapterType] ?? agent.adapterType}
                    </span>
                  )}
                  {agent && typeof agent.adapterConfig.model === "string" && agent.adapterConfig.model && (
                    <span className="text-[10px] text-primary/70 font-mono leading-tight mt-0.5">
                      {extractModelName(agent.adapterConfig.model)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}

const roleLabels: Record<string, string> = AGENT_ROLE_LABELS;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

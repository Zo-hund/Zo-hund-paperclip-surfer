import { Router } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Db } from "@paperclipai/db";
import { agents, issues, heartbeatRuns } from "@paperclipai/db";
import { and, desc, eq } from "drizzle-orm";
import { heartbeatService } from "../services/index.js";
import { logger } from "../middleware/logger.js";

const TOOL_LIST = [
  {
    name: "list_agents",
    description: "List AI agents in the company.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter by status (active, paused, terminated). Omit for all." },
      },
    },
  },
  {
    name: "get_agent",
    description: "Get details for a specific agent by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "wake_agent",
    description: "Trigger an agent wakeup to start a run.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Agent UUID" },
        reason: { type: "string", description: "Optional reason / context for this wakeup" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "list_issues",
    description: "List tasks/issues in the company.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter by status (e.g. open, in_progress, done). Omit for all." },
        limit: { type: "number", description: "Max results (default 20, max 100)" },
      },
    },
  },
  {
    name: "get_issue",
    description: "Get details for a specific issue by ID or identifier (e.g. AMXA-42).",
    inputSchema: {
      type: "object" as const,
      properties: {
        issueId: { type: "string", description: "Issue UUID or identifier string" },
      },
      required: ["issueId"],
    },
  },
  {
    name: "create_issue",
    description: "Create a new task/issue.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Issue title" },
        description: { type: "string", description: "Optional markdown description" },
        projectId: { type: "string", description: "Optional project UUID to assign the issue to" },
        assigneeAgentId: { type: "string", description: "Optional agent UUID to assign the issue to" },
        priority: { type: "string", description: "Priority: urgent, high, medium, low, none" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_runs",
    description: "List recent agent runs (heartbeat runs).",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string", description: "Filter by agent UUID (optional)" },
        status: { type: "string", description: "Filter by status: queued, running, completed, failed, cancelled" },
        limit: { type: "number", description: "Max results (default 20, max 50)" },
      },
    },
  },
];

function createMcpServer(db: Db, companyId: string): Server {
  const server = new Server(
    { name: "paperclip", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_LIST }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case "list_agents": {
          const rows = await db
            .select({ id: agents.id, name: agents.name, status: agents.status, adapterType: agents.adapterType, role: agents.role })
            .from(agents)
            .where(
              a["status"]
                ? and(eq(agents.companyId, companyId), eq(agents.status, a["status"] as string))
                : eq(agents.companyId, companyId),
            )
            .orderBy(agents.name)
            .limit(100);
          return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
        }

        case "get_agent": {
          const row = await db
            .select()
            .from(agents)
            .where(and(eq(agents.id, a["agentId"] as string), eq(agents.companyId, companyId)))
            .then((r) => r[0] ?? null);
          if (!row) return { content: [{ type: "text" as const, text: "Agent not found" }], isError: true };
          const { adapterConfig: _, ...safe } = row;
          return { content: [{ type: "text" as const, text: JSON.stringify(safe, null, 2) }] };
        }

        case "wake_agent": {
          const svc = heartbeatService(db);
          const run = await svc.wakeup(a["agentId"] as string, {
            contextSnapshot: { wakeReason: (a["reason"] as string | undefined) ?? "mcp_wakeup" },
            source: "on_demand",
            triggerDetail: "manual",
          });
          return { content: [{ type: "text" as const, text: JSON.stringify({ runId: run?.id ?? null, status: "queued" }, null, 2) }] };
        }

        case "list_issues": {
          const limit = Math.min(Number(a["limit"]) || 20, 100);
          const rows = await db
            .select({ id: issues.id, identifier: issues.identifier, title: issues.title, status: issues.status, priority: issues.priority })
            .from(issues)
            .where(
              a["status"]
                ? and(eq(issues.companyId, companyId), eq(issues.status, a["status"] as string))
                : eq(issues.companyId, companyId),
            )
            .orderBy(desc(issues.updatedAt))
            .limit(limit);
          return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
        }

        case "get_issue": {
          const issueIdOrRef = a["issueId"] as string;
          const row = await db
            .select()
            .from(issues)
            .where(
              and(
                eq(issues.companyId, companyId),
                issueIdOrRef.includes("-")
                  ? eq(issues.identifier, issueIdOrRef)
                  : eq(issues.id, issueIdOrRef),
              ),
            )
            .then((r) => r[0] ?? null);
          if (!row) return { content: [{ type: "text" as const, text: "Issue not found" }], isError: true };
          return { content: [{ type: "text" as const, text: JSON.stringify(row, null, 2) }] };
        }

        case "create_issue": {
          const { issueService } = await import("../services/index.js");
          const svc = issueService(db);
          const created = await svc.create(companyId, {
            title: a["title"] as string,
            description: (a["description"] as string | undefined) ?? null,
            projectId: (a["projectId"] as string | undefined) ?? null,
            assigneeAgentId: (a["assigneeAgentId"] as string | undefined) ?? null,
            priority: ((a["priority"] as string | undefined) ?? "medium") as "urgent" | "high" | "medium" | "low" | "none",
          });
          return { content: [{ type: "text" as const, text: JSON.stringify({ id: created.id, identifier: created.identifier }, null, 2) }] };
        }

        case "list_runs": {
          const limit = Math.min(Number(a["limit"]) || 20, 50);
          const statusFilter = a["status"] as string | undefined;
          const agentIdFilter = a["agentId"] as string | undefined;
          const rows = await db
            .select({ id: heartbeatRuns.id, agentId: heartbeatRuns.agentId, status: heartbeatRuns.status, runMode: heartbeatRuns.runMode, createdAt: heartbeatRuns.createdAt, finishedAt: heartbeatRuns.finishedAt })
            .from(heartbeatRuns)
            .where(
              and(
                eq(heartbeatRuns.companyId, companyId),
                agentIdFilter ? eq(heartbeatRuns.agentId, agentIdFilter) : undefined,
                statusFilter ? eq(heartbeatRuns.status, statusFilter) : undefined,
              ),
            )
            .orderBy(desc(heartbeatRuns.createdAt))
            .limit(limit);
          return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
        }

        default:
          return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, tool: name, companyId }, "MCP tool call failed");
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  });

  return server;
}

export function mcpEndpointRoutes(db: Db) {
  const router = Router();

  // Single route handles GET (SSE listen) and POST (send message) for Streamable HTTP
  router.all("/mcp", async (req, res) => {
    const { actor } = req;
    if (actor.type === "none") {
      res.status(401).json({ error: "Authentication required for MCP endpoint" });
      return;
    }

    // Resolve companyId: agent actors have it directly; board actors use query/header or first membership
    let companyId: string | null = null;
    if (actor.type === "agent") {
      companyId = actor.companyId ?? null;
    } else {
      const qc = req.query["companyId"] ?? req.headers["x-company-id"];
      if (typeof qc === "string" && qc) {
        companyId = qc;
        if (actor.companyIds && !actor.companyIds.includes(companyId) && !actor.isInstanceAdmin) {
          res.status(403).json({ error: "Company access denied" });
          return;
        }
      } else {
        companyId = actor.companyIds?.[0] ?? null;
      }
    }

    if (!companyId) {
      res.status(400).json({ error: "companyId required — pass as ?companyId= query param or X-Company-Id header" });
      return;
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = createMcpServer(db, companyId);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.warn({ err, companyId }, "MCP endpoint error");
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    } finally {
      res.on("finish", () => { server.close().catch(() => {}); });
    }
  });

  return router;
}

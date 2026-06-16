import { Router } from "express";

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Paperclip API",
    version: "1.0.0",
    description: "Control plane for AI-agent companies. Manage agents, tasks, approvals, budgets, and more.",
  },
  servers: [{ url: "/api", description: "Local server" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key or JWT" },
    },
    schemas: {
      Agent: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          status: { type: "string", enum: ["active", "paused", "terminated", "pending_approval"] },
          adapterType: { type: "string" },
          role: { type: "string" },
          companyId: { type: "string", format: "uuid" },
        },
      },
      Issue: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          identifier: { type: "string", example: "AMXA-42" },
          title: { type: "string" },
          status: { type: "string", enum: ["open", "in_progress", "done", "cancelled"] },
          priority: { type: "string", enum: ["urgent", "high", "medium", "low", "none"] },
          companyId: { type: "string", format: "uuid" },
          projectId: { type: "string", format: "uuid", nullable: true },
          assigneeAgentId: { type: "string", format: "uuid", nullable: true },
        },
      },
      HeartbeatRun: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          agentId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["queued", "running", "completed", "failed", "cancelled"] },
          runMode: { type: "string", enum: ["sim", "live"] },
          createdAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Approval: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["pending", "approved", "rejected", "cancelled", "revision_requested", "escalated"] },
          companyId: { type: "string", format: "uuid" },
          requestedByAgentId: { type: "string", format: "uuid", nullable: true },
        },
      },
      Webhook: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          url: { type: "string", format: "uri" },
          events: { type: "array", items: { type: "string" } },
          enabled: { type: "boolean" },
          description: { type: "string", nullable: true },
          failureCount: { type: "integer" },
          lastDeliveredAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
    },
  },
  paths: {
    "/companies/{companyId}/agents": {
      get: {
        summary: "List agents",
        tags: ["Agents"],
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Agent list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Agent" } } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/companies/{companyId}/agents/{agentId}/wakeup": {
      post: {
        summary: "Wake up an agent",
        tags: ["Agents"],
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "agentId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  source: { type: "string", enum: ["on_demand", "timer", "assignment", "automation"] },
                  reason: { type: "string" },
                  payload: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Run created", content: { "application/json": { schema: { $ref: "#/components/schemas/HeartbeatRun" } } } },
        },
      },
    },
    "/companies/{companyId}/issues": {
      get: {
        summary: "List issues",
        tags: ["Issues"],
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "assigneeAgentId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Issue list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Issue" } } } } },
        },
      },
      post: {
        summary: "Create an issue",
        tags: ["Issues"],
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  projectId: { type: "string", format: "uuid" },
                  assigneeAgentId: { type: "string", format: "uuid" },
                  priority: { type: "string", enum: ["urgent", "high", "medium", "low", "none"] },
                  runMode: { type: "string", enum: ["sim", "live"] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created issue", content: { "application/json": { schema: { $ref: "#/components/schemas/Issue" } } } },
        },
      },
    },
    "/companies/{companyId}/approvals": {
      get: {
        summary: "List approvals",
        tags: ["Approvals"],
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Approval list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Approval" } } } } },
        },
      },
    },
    "/companies/{companyId}/webhooks": {
      get: {
        summary: "List outbound webhooks",
        tags: ["Webhooks"],
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Webhook list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Webhook" } } } } },
        },
      },
      post: {
        summary: "Register a webhook",
        tags: ["Webhooks"],
        parameters: [{ name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string", format: "uri" },
                  secret: { type: "string", description: "HMAC signing secret. Auto-generated if omitted." },
                  events: { type: "array", items: { type: "string" }, description: "Event types to subscribe to. Empty = all events." },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created webhook (includes full secret)", content: { "application/json": { schema: { $ref: "#/components/schemas/Webhook" } } } },
        },
      },
    },
    "/companies/{companyId}/webhooks/{id}": {
      patch: {
        summary: "Update a webhook",
        tags: ["Webhooks"],
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { url: { type: "string" }, events: { type: "array", items: { type: "string" } }, enabled: { type: "boolean" }, description: { type: "string" } } } } },
        },
        responses: { "200": { description: "Updated webhook" } },
      },
      delete: {
        summary: "Delete a webhook",
        tags: ["Webhooks"],
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/companies/{companyId}/webhooks/{id}/deliveries": {
      get: {
        summary: "List webhook delivery history",
        tags: ["Webhooks"],
        parameters: [
          { name: "companyId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: { "200": { description: "Delivery history" } },
      },
    },
    "/mcp": {
      post: {
        summary: "Paperclip MCP server endpoint (Streamable HTTP)",
        description: "Connect to Paperclip as an MCP tool server. Pass `?companyId=` or `X-Company-Id` header to scope the session.",
        tags: ["MCP"],
        parameters: [{ name: "companyId", in: "query", schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "MCP protocol response" },
          "401": { description: "Unauthorized" },
        },
      },
      get: {
        summary: "Paperclip MCP server SSE stream",
        tags: ["MCP"],
        parameters: [{ name: "companyId", in: "query", schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "SSE stream", content: { "text/event-stream": {} } },
        },
      },
    },
  },
};

export function openApiRoutes() {
  const router = Router();

  router.get("/openapi.json", (_req, res) => {
    res.json(SPEC);
  });

  router.get("/openapi.yaml", (_req, res) => {
    res.type("text/yaml").send(toYaml(SPEC));
  });

  return router;
}

function toYaml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null) return "null";
  if (obj === undefined) return "";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "string") {
    if (obj.includes("\n") || obj.includes(":") || obj.includes("#") || obj.startsWith(" ") || obj === "") {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj.map((v) => `\n${pad}- ${toYaml(v, indent + 1)}`).join("");
  }
  const entries = Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "{}";
  return entries
    .map(([k, v]) => {
      const valStr = toYaml(v, indent + 1);
      if (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length > 0) {
        return `\n${pad}${k}:${valStr}`;
      }
      if (Array.isArray(v) && (v as unknown[]).length > 0) {
        return `\n${pad}${k}:${valStr}`;
      }
      return `\n${pad}${k}: ${valStr}`;
    })
    .join("");
}

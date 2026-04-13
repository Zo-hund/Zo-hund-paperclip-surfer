import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Paperclip Hermes MCP Server
 * 
 * Provides Paperclip internal tools to external agents (like the Nous Hermes Agent).
 * This allows specialized agents to report deliverables, manage tasks, and notify the board.
 */

const API_URL = process.env.PAPERCLIP_API_URL || "http://localhost:3100/api";

const server = new Server(
  {
    name: "paperclip-hermes",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "report_deliverable",
        description: "Report a finished work product (ad, document, code) to the Master Briefcase for Board review.",
        inputSchema: {
          type: "object",
          properties: {
            issueId: { type: "string", description: "The UUID of the task this deliverable belongs to." },
            companyId: { type: "string", description: "The UUID of the company." },
            title: { type: "string", description: "Title of the deliverable (e.g., 'FB Video Ad - Draft 1')." },
            url: { type: "string", description: "Public or internal URL to the deliverable." },
            type: { type: "string", enum: ["document", "image", "video", "code", "social_post"], description: "Type of content." },
            status: { type: "string", enum: ["draft", "pending_review", "approved", "live"], description: "Current lifecycle status." },
            isPrimary: { type: "boolean", description: "Whether this is the main output for the task (Live Standard)." },
            summary: { type: "string", description: "Short description of what was achieved." },
            metadata: { type: "object", description: "Additional data." },
          },
          required: ["issueId", "companyId", "title", "type", "status"],
        },
      },
      {
        name: "send_alert",
        description: "Post a high-priority notification to the activity stream.",
        inputSchema: {
          type: "object",
          properties: {
            companyId: { type: "string" },
            message: { type: "string", description: "The alert content." },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          },
          required: ["companyId", "message"],
        },
      },
      {
        name: "notify_board",
        description: "Send a direct update to the Board of Directors view.",
        inputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            healthStatus: { type: "string", enum: ["healthy", "warning", "critical"] },
          },
          required: ["summary", "healthStatus"],
        },
      },
    ],
  };
});

// ── Tool Execution ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "report_deliverable": {
        const res = await fetch(`${API_URL}/companies/${args?.companyId}/issues/${args?.issueId}/work-products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: args?.title,
            url: args?.url,
            type: args?.type,
            status: args?.status,
            isPrimary: !!args?.isPrimary,
            summary: args?.summary,
            metadata: args?.metadata || {},
            provider: "hermes-mcp",
          }),
        });
        if (!res.ok) throw new Error(`API error: ${res.statusText}`);
        return { content: [{ type: "text", text: "Reported to Briefcase." }] };
      }

      case "send_alert": {
        const res = await fetch(`${API_URL}/activity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: args?.companyId,
            actorId: process.env.AGENT_ID || "hermes-mcp-agent",
            action: "alert",
            metadata: { message: args?.message, priority: args?.priority },
          }),
        });
        if (!res.ok) throw new Error(`API error: ${res.statusText}`);
        return { content: [{ type: "text", text: "Alert broadcasted." }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: error.message }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Paperclip Hermes MCP Server started (stdio mode)");

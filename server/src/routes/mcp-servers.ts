import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { mcpResolverService } from "../services/agent-runtime/mcp-resolver.js";
import { assertCompanyAccess } from "./authz.js";
import { logger } from "../middleware/logger.js";

export function mcpServerRoutes(db: Db) {
  const router = Router();
  const svc = mcpResolverService(db);

  async function getAgentCompanyId(agentId: string): Promise<string | null> {
    const [agent] = await db
      .select({ companyId: agents.companyId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    return agent?.companyId ?? null;
  }

  // List all MCP servers for a company
  router.get("/companies/:companyId/mcp-servers", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const servers = await svc.listServers(companyId);
    res.json(servers);
  });

  // Create an MCP server (manual)
  router.post("/companies/:companyId/mcp-servers", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const { name, description, command, args, env, transportType, transportUrl, scope, agentId } = req.body;

    // HTTP/SSE MCPs don't need a command — they use a URL instead
    const needsCommand = transportType === "stdio";
    if (!name || !transportType || (needsCommand && !command)) {
      res.status(400).json({ error: "Missing required fields: name, transportType (and command for stdio)" });
      return;
    }

    const server = await svc.createServer({
      companyId,
      name,
      description,
      command,
      args,
      env,
      transportType,
      transportUrl,
      scope,
      agentId,
    });

    res.status(201).json(server);
  });

  // Sync from Claude Code settings
  router.post("/companies/:companyId/mcp-servers/sync", async (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);

    const result = await svc.syncFromClaudeCode(companyId);
    const servers = await svc.listServers(companyId);
    res.json({ imported: result.discovered.length, servers });
  });

  // Update an MCP server
  router.patch("/companies/:companyId/mcp-servers/:serverId", async (req, res) => {
    const { companyId, serverId } = req.params;
    assertCompanyAccess(req, companyId);

    const { name, description, command, args, env, transportType, transportUrl, enabled } = req.body;

    const updated = await svc.updateServer(serverId, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(command !== undefined && { command }),
      ...(args !== undefined && { args }),
      ...(env !== undefined && { env }),
      ...(transportType !== undefined && { transportType }),
      ...(transportUrl !== undefined && { transportUrl }),
      ...(enabled !== undefined && { enabled }),
    });

    if (!updated) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }

    res.json(updated);
  });

  // Delete an MCP server
  router.delete("/companies/:companyId/mcp-servers/:serverId", async (req, res) => {
    const { companyId, serverId } = req.params;
    assertCompanyAccess(req, companyId);

    const deleted = await svc.deleteServer(serverId);
    if (!deleted) {
      res.status(404).json({ error: "MCP server not found" });
      return;
    }

    res.json({ success: true });
  });

  // Exclude an MCP server from an agent
  router.post("/agents/:agentId/mcp-exclusions", async (req, res) => {
    const { agentId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const { mcpServerId } = req.body;
    if (!mcpServerId) {
      res.status(400).json({ error: "Missing required field: mcpServerId" });
      return;
    }

    const result = await svc.addExclusion(agentId, mcpServerId);
    res.status(201).json(result);
  });

  // Remove an MCP exclusion
  router.delete("/agents/:agentId/mcp-exclusions/:serverId", async (req, res) => {
    const { agentId, serverId } = req.params;
    const companyId = await getAgentCompanyId(agentId);
    if (!companyId) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const result = await svc.removeExclusion(agentId, serverId);
    res.json(result);
  });

  // Initiate Google OAuth flow
  router.get("/auth/google-oauth-url", async (req, res) => {
    const { companyId, mcpServerId } = req.query;
    if (!companyId || typeof companyId !== "string") {
      res.status(400).json({ error: "Missing companyId query parameter" });
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.status(400).json({ error: "Google OAuth is not configured on this server (missing GOOGLE_CLIENT_ID)" });
      return;
    }

    const publicUrl = process.env.PAPERCLIP_PUBLIC_URL || process.env.BETTER_AUTH_URL || "http://localhost:3100";
    const redirectUri = `${publicUrl}/api/auth/google-oauth-callback`;
    
    // Scopes to request for Gmail and Calendar access
    const scope = encodeURIComponent(
      "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar"
    );

    // State encodes companyId and optionally mcpServerId
    const state = encodeURIComponent(`${companyId}:${mcpServerId || ""}`);

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;

    res.json({ url: googleAuthUrl });
  });

  // Handle Google OAuth redirect callback
  router.get("/auth/google-oauth-callback", async (req, res) => {
    const { code, state, error } = req.query;
    const publicUrl = process.env.PAPERCLIP_PUBLIC_URL || process.env.BETTER_AUTH_URL || "http://localhost:3100";

    if (error) {
      logger.error({ error }, "Google OAuth callback error");
      res.redirect(`${publicUrl}/companies?error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (!code || typeof code !== "string" || !state || typeof state !== "string") {
      res.status(400).send("Invalid OAuth callback parameters.");
      return;
    }

    try {
      const [companyId, mcpServerId] = state.split(":");
      if (!companyId) {
        throw new Error("Missing companyId in OAuth state");
      }

      // Query company prefix to redirect user back to the correct path
      const { companies } = await import("@paperclipai/db");
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) {
        throw new Error(`Company not found: ${companyId}`);
      }

      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error("Google OAuth credentials not configured on server");
      }

      const redirectUri = `${publicUrl}/api/auth/google-oauth-callback`;

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Failed to exchange auth code: ${errText}`);
      }

      const tokenData = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      if (!tokenData.refresh_token) {
        logger.warn({ companyId }, "OAuth callback did not return a refresh token");
      }

      const refreshToken = tokenData.refresh_token;
      if (refreshToken) {
        // Store refresh token as Company Secret
        const { secretService } = await import("../services/secrets.js");
        const secretsSvc = secretService(db);
        let secret = await secretsSvc.getByName(companyId, "GOOGLE_WORKSPACE_REFRESH_TOKEN");

        if (secret) {
          await secretsSvc.rotate(secret.id, { value: refreshToken }, { userId: "system", agentId: null });
        } else {
          secret = await secretsSvc.create(
            companyId,
            {
              name: "GOOGLE_WORKSPACE_REFRESH_TOKEN",
              provider: "local_encrypted",
              value: refreshToken,
              description: "Google Workspace OAuth Refresh Token automatically generated",
            },
            { userId: "system", agentId: null }
          );
        }

        // Update the MCP server config env variables to bind to this secret
        const mcpServers = await svc.listServers(companyId);
        
        // Find Google Calendar and Gmail MCP servers
        const googleMcpServers = mcpServers.filter(
          (s) => s.name.toLowerCase().includes("gmail") || s.name.toLowerCase().includes("google calendar") || s.name.toLowerCase().includes("gcal")
        );

        for (const gServer of googleMcpServers) {
          const updatedEnv = {
            ...(gServer.env as Record<string, any>),
            GOOGLE_CLIENT_ID: clientId,
            GOOGLE_CLIENT_SECRET: clientSecret,
            GOOGLE_REFRESH_TOKEN: `secret_ref(${secret.id})`,
          };

          await svc.updateServer(gServer.id, { env: updatedEnv });
        }

        logger.info(
          { companyId, updatedCount: googleMcpServers.length },
          "Google Workspace refresh token secret generated and bound to MCP servers"
        );
      }

      // Redirect user back to the MCP servers list page in the UI
      res.redirect(`${publicUrl}/${company.issuePrefix}/mcp-servers?linked=google`);
    } catch (err: any) {
      logger.error({ err }, "Google OAuth Callback Handler Failed");
      res.status(500).send(`Authentication failed: ${err?.message || err}`);
    }
  });

  return router;
}

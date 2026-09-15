import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import type { OpenRouterCredentialStatus } from "@paperclipai/shared";
import { isOpenRouterProvisioned, resolveOpenRouterKey, validateOpenRouterKey, hasOpenRouterHostTools } from "@paperclipai/adapter-openrouter/server";
import { assertBoard, assertCompanyAccess, assertCompanyRole } from "./authz.js";
import { secretService } from "../services/secrets.js";
import { logActivity } from "../services/activity-log.js";
import { unprocessable } from "../errors.js";

const keySchema = z.string().trim().min(1).max(1024).refine((key) => !/\s/.test(key) && !key.includes("REDACTED"));
const keyName = "OPENROUTER_API_KEY";

export function openRouterCredentialRoutes(db: Db) {
  const router = Router();
  const secrets = secretService(db);
  const path = "/companies/:companyId/openrouter-credentials";
  const validationWindows = new Map<string, { startedAt: number; count: number }>();

  // Apply before parsing/authorization so failures cannot log a submitted credential.
  router.use(path, (req, res, next) => {
    res.locals.openRouterSubmittedKey = req.body?.value;
    req.body = {};
    assertBoard(req);
    assertCompanyAccess(req, req.params.companyId as string);
    assertCompanyRole(req, req.params.companyId as string, "admin");
    if (req.method === "PUT" || req.method === "POST") {
      const now = Date.now();
      for (const [id, window] of validationWindows) {
        if (now - window.startedAt >= 60_000) validationWindows.delete(id);
      }
      const id = `${req.actor.userId ?? "board"}:${req.params.companyId}`;
      const window = validationWindows.get(id) ?? { startedAt: now, count: 0 };
      validationWindows.set(id, window);
      if (++window.count > 10) {
        res.setHeader("Retry-After", "60");
        res.status(429).json({ error: "Too many OpenRouter key checks. Try again in a minute." });
        return;
      }
    }
    next();
  });

  async function status(companyId: string): Promise<OpenRouterCredentialStatus> {
    const companyKey = await secrets.getByName(companyId, keyName);
    const provisionedAccess = isOpenRouterProvisioned(companyId);
    const provisionedKeyConfigured = provisionedAccess && Boolean(process.env.OPENROUTER_API_KEY?.trim());
    return {
      companyKeyConfigured: Boolean(companyKey), provisionedAccess, provisionedKeyConfigured,
      defaultSource: companyKey ? "company" : provisionedKeyConfigured ? "platform" : "none",
      hostToolsEnabled: hasOpenRouterHostTools(companyId),
    };
  }

  router.get(path, async (req, res) => {
    res.json(await status(req.params.companyId as string));
  });

  router.put(path, async (req, res) => {
    const parsed = keySchema.safeParse(res.locals.openRouterSubmittedKey);
    delete res.locals.openRouterSubmittedKey;
    if (!parsed.success) throw unprocessable("Enter a non-empty OpenRouter API key without whitespace.");
    try { await validateOpenRouterKey(parsed.data); } catch (err) {
      throw unprocessable(err instanceof Error ? err.message : "OpenRouter key validation failed.");
    }
    const companyId = req.params.companyId as string;
    const existing = await secrets.getByName(companyId, keyName);
    const actor = { userId: req.actor.userId ?? "board", agentId: null };
    const saved = existing
      ? await secrets.rotate(existing.id, { value: parsed.data }, actor)
      : await secrets.create(companyId, {
        name: keyName, provider: "local_encrypted", value: parsed.data,
        description: "Company-owned OpenRouter key. Default for this company's OpenRouter agents.",
      }, actor);
    await logActivity(db, {
      companyId, actorType: "user", actorId: actor.userId,
      action: existing ? "openrouter.key_rotated" : "openrouter.key_created",
      entityType: "secret", entityId: saved.id, details: { version: saved.latestVersion },
    });
    res.json(await status(companyId));
  });

  router.post(`${path}/validate`, async (req, res) => {
    const companyId = req.params.companyId as string;
    try {
      const { config } = await secrets.resolveAdapterConfigForRuntime(companyId, {}, "openrouter");
      await validateOpenRouterKey(resolveOpenRouterKey(companyId, config));
      res.json({ valid: true, message: "OpenRouter accepted the company default key. No model inference was requested." });
    } catch (err) {
      res.json({ valid: false, message: err instanceof Error ? err.message : "OpenRouter key validation failed." });
    }
  });

  router.delete(path, async (req, res) => {
    const companyId = req.params.companyId as string;
    const existing = await secrets.getByName(companyId, keyName);
    if (existing) {
      await secrets.remove(existing.id);
      await logActivity(db, {
        companyId, actorType: "user", actorId: req.actor.userId ?? "board",
        action: "openrouter.key_removed", entityType: "secret", entityId: existing.id,
        details: { name: keyName },
      });
    }
    res.json(await status(companyId));
  });
  return router;
}

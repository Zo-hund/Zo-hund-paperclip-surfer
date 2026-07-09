import express, { Router, type Request as ExpressRequest } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import type { StorageService } from "./storage/types.js";
import { httpLogger, errorHandler } from "./middleware/index.js";
import { actorMiddleware } from "./middleware/auth.js";
import { boardMutationGuard } from "./middleware/board-mutation-guard.js";
import { privateHostnameGuard, resolvePrivateHostnameAllowSet } from "./middleware/private-hostname-guard.js";
import { healthRoutes } from "./routes/health.js";
import { companyRoutes } from "./routes/companies.js";
import { companyMembersRoutes } from "./routes/company-members.js";
import { companySkillRoutes } from "./routes/company-skills.js";
import { agentRoutes } from "./routes/agents.js";
import { projectRoutes } from "./routes/projects.js";
import { issueRoutes } from "./routes/issues.js";
import { routineRoutes } from "./routes/routines.js";
import { meetingsRouter as meetingRoutes } from "./routes/meetings.js";
import { heartbeatService } from "./services/index.js";
import { executionWorkspaceRoutes } from "./routes/execution-workspaces.js";
import { goalRoutes } from "./routes/goals.js";
import { approvalRoutes } from "./routes/approvals.js";
import { secretRoutes } from "./routes/secrets.js";
import { costRoutes } from "./routes/costs.js";
import { activityRoutes } from "./routes/activity.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { sidebarBadgeRoutes } from "./routes/sidebar-badges.js";
import { instanceSettingsRoutes } from "./routes/instance-settings.js";
import { llmRoutes } from "./routes/llms.js";
import { assetRoutes } from "./routes/assets.js";
import { companyContentRoutes, publicCompanyContentAssetRoutes } from "./routes/company-content.js";
import { accessRoutes } from "./routes/access.js";
import { pluginRoutes } from "./routes/plugins.js";
import { pluginUiStaticRoutes } from "./routes/plugin-ui-static.js";
import { agentMemoryRoutes } from "./routes/agent-memories.js";
import { mcpServerRoutes } from "./routes/mcp-servers.js";
import { agentKpiRoutes } from "./routes/agent-kpis.js";
import { agentExperimentRoutes } from "./routes/agent-experiments.js";
import { amxRoutes } from "./routes/amx.js";
import { amxNodeRoutes } from "./routes/amx-nodes.js";
import { lmsRoutes } from "./routes/lms.js";
import { auditRoutes } from "./routes/audit.js";
import { skillChangeRoutes } from "./routes/skill-changes.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { mcpEndpointRoutes } from "./routes/mcp-endpoint.js";
import { openApiRoutes } from "./routes/openapi.js";
import { livekitRoutes } from "./routes/livekit.js";
import { meetingGuestRoutes } from "./routes/meeting-guests.js";
import { pushRoutes } from "./routes/push.js";
import { meRoutes } from "./routes/me.js";
import { verifyRoutes } from "./routes/verify.js";
import { stripeWebhookRoutes, stripeApiRoutes } from "./routes/stripe.js";
import { opprrcRoutes } from "./routes/opprrc.js";
import { startOpprrcBackupWorker } from "./services/opprrc-backup-worker.js";
import { ensureOpprcRootStructure } from "./services/opprrc-storage.js";
import { applyUiBranding } from "./ui-branding.js";
import { logger } from "./middleware/logger.js";
import { DEFAULT_LOCAL_PLUGIN_DIR, pluginLoader } from "./services/plugin-loader.js";
import { createPluginWorkerManager } from "./services/plugin-worker-manager.js";
import { createPluginJobScheduler } from "./services/plugin-job-scheduler.js";
import { pluginJobStore } from "./services/plugin-job-store.js";
import { createPluginToolDispatcher } from "./services/plugin-tool-dispatcher.js";
import { pluginLifecycleManager } from "./services/plugin-lifecycle.js";
import { createPluginJobCoordinator } from "./services/plugin-job-coordinator.js";
import { buildHostServices, flushPluginLogBuffer } from "./services/plugin-host-services.js";
import { createPluginEventBus } from "./services/plugin-event-bus.js";
import { setPluginEventBus } from "./services/activity-log.js";
import { createPluginDevWatcher } from "./services/plugin-dev-watcher.js";
import { createPluginHostServiceCleanup } from "./services/plugin-host-service-cleanup.js";
import { pluginRegistryService } from "./services/plugin-registry.js";
import { createHostClientHandlers } from "@paperclipai/plugin-sdk";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";

type UiMode = "none" | "static" | "vite-dev";

const UI_ASSET_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".css",
  ".map",
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".avif",
  ".json",
  ".txt",
  ".xml",
  ".webmanifest",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

function isAssetLikePathname(pathname: string): boolean {
  if (pathname.startsWith("/assets/")) return true;
  const ext = path.extname(pathname).toLowerCase();
  return ext.length > 0 && UI_ASSET_EXTENSIONS.has(ext);
}

function isMobileUserAgent(userAgent: string | undefined): boolean {
  return /\b(Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini)\b/i.test(userAgent ?? "");
}

function buildAmxRemoteWorkMobileHtml(origin: string): string {
  const fullConsoleUrl = `${origin}/dispatch/remote-work?full=1`;
  const apiBaseUrl = `${origin}/api`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>AMX Remote Work Mobile</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #05070d; color: #f7f8fb; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top, #172033 0, #05070d 42rem); }
    main { width: min(100%, 42rem); margin: 0 auto; padding: 28px 18px 36px; }
    .eyebrow { color: #8bd3ff; font-size: 12px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    h1 { margin: 10px 0 8px; font-size: clamp(30px, 10vw, 48px); line-height: .95; letter-spacing: 0; }
    p { color: #b9c1cf; line-height: 1.55; }
    .panel { margin-top: 18px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; background: rgba(255,255,255,.06); padding: 16px; }
    .grid { display: grid; gap: 10px; }
    a.button { display: flex; align-items: center; justify-content: center; min-height: 46px; border-radius: 10px; padding: 0 14px; font-weight: 800; text-decoration: none; color: #041016; background: #8bd3ff; }
    a.secondary { background: rgba(255,255,255,.08); color: #f7f8fb; border: 1px solid rgba(255,255,255,.14); }
    code { display: block; overflow-x: auto; padding: 12px; border-radius: 10px; background: rgba(0,0,0,.36); color: #d8e8ff; font-size: 12px; line-height: 1.5; white-space: pre; }
    .status { display: inline-flex; gap: 8px; align-items: center; color: #99f6c8; font-weight: 800; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 14px #34d399; }
    ul { padding-left: 20px; color: #d8deea; line-height: 1.55; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">AMX Local + Cloud</div>
    <h1>Remote Work Mobile</h1>
    <p class="status"><span class="dot"></span>Cloud route reached this phone.</p>
    <p>This is the lightweight mobile dispatch screen. Use it when the full AMX console is slow to boot on cellular or carrier-filtered networks.</p>
    <div class="grid">
      <a class="button" href="${fullConsoleUrl}">Open full Work Mesh console</a>
      <a class="button secondary" href="${origin}/api/health">Check API health</a>
    </div>
    <section class="panel">
      <strong>Dispatch test</strong>
      <ul>
        <li>Enroll the PC as an AMX node against the cloud API.</li>
        <li>Create a read-only GitHub lease in the full console.</li>
        <li>Run poll and execute on the PC, then submit evidence.</li>
      </ul>
      <code>paperclipai --api-base ${apiBaseUrl} --company-id &lt;company-id&gt; amx-node enroll --name "Owner PC" --capabilities heartbeat_worker,filesystem_read,git,github_repo</code>
    </section>
    <section class="panel">
      <strong>If this page loads but the full console does not</strong>
      <p>The cloud app is reachable. The full dashboard bundle may be blocked, cached, or slow on this mobile network. Try cellular vs Wi-Fi, clear site data, then use the full console button again.</p>
    </section>
  </main>
</body>
</html>`;
}

export function resolveViteHmrPort(serverPort: number): number {
  const preferred = serverPort + 10_000;
  if (preferred <= 65_535) return Math.max(1_024, preferred);
  const fallback = serverPort - 10_000;
  if (fallback >= 1_024) return fallback;
  return 1_024;
}



export async function createApp(
  db: Db,
  opts: {
    uiMode: UiMode;
    serverPort: number;
    storageService: StorageService;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    allowedHostnames: string[];
    bindHost: string;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    instanceId?: string;
    hostVersion?: string;
    localPluginDir?: string;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
  },
) {
  const app = express();

  app.use(express.json({
    // Company import/export payloads can inline full portable packages.
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  }));
  app.use(httpLogger);
  const privateHostnameGateEnabled =
    opts.deploymentMode === "authenticated" && opts.deploymentExposure === "private";
  const privateHostnameAllowSet = resolvePrivateHostnameAllowSet({
    allowedHostnames: opts.allowedHostnames,
    bindHost: opts.bindHost,
  });
  app.use(
    privateHostnameGuard({
      enabled: privateHostnameGateEnabled,
      allowedHostnames: opts.allowedHostnames,
      bindHost: opts.bindHost,
    }),
  );
  app.use(
    actorMiddleware(db, {
      deploymentMode: opts.deploymentMode,
      resolveSession: opts.resolveSession,
    }),
  );
  app.get("/api/auth/get-session", (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({
      session: {
        id: `paperclip:${req.actor.source}:${req.actor.userId}`,
        userId: req.actor.userId,
      },
      user: {
        id: req.actor.userId,
        email: null,
        name: req.actor.source === "local_implicit" ? "Local Board" : null,
      },
    });
  });
  if (opts.betterAuthHandler) {
    app.all("/api/auth/*authPath", opts.betterAuthHandler);
  }
  app.use(llmRoutes(db));
  app.use("/stripe", stripeWebhookRoutes(db));

  // Mount API routes
  const api = Router();
  api.use(boardMutationGuard());
  api.use(
    "/health",
    healthRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      companyDeletionEnabled: opts.companyDeletionEnabled,
    }),
  );
  api.use("/companies", companyRoutes(db, opts.storageService));
  api.use("/companies/:companyId/amx-nodes", amxNodeRoutes(db));
  api.use("/companies/:companyId/members", companyMembersRoutes(db));
  api.use(companySkillRoutes(db));
  api.use(agentRoutes(db));
  api.use(assetRoutes(db, opts.storageService));
  api.use(companyContentRoutes(db, opts.storageService));
  api.use(publicCompanyContentAssetRoutes(db, opts.storageService));
  api.use(projectRoutes(db));
  api.use(issueRoutes(db, opts.storageService));
  api.use(routineRoutes(db));
  api.use("/meetings", meetingRoutes(db, heartbeatService(db) as any));
  api.use(executionWorkspaceRoutes(db));
  api.use(goalRoutes(db));
  api.use(approvalRoutes(db));
  api.use(secretRoutes(db));
  api.use(costRoutes(db));
  api.use(activityRoutes(db));
  api.use(dashboardRoutes(db));
  api.use(sidebarBadgeRoutes(db));
  api.use(instanceSettingsRoutes(db));
  api.use(agentMemoryRoutes(db));
  api.use(mcpServerRoutes(db));
  api.use(agentKpiRoutes(db));
  api.use(agentExperimentRoutes(db));
  api.use(amxRoutes(db));
  api.use(opprrcRoutes(db, opts.storageService));
  api.use(lmsRoutes(db));
  api.use(stripeApiRoutes(db));
  api.use(auditRoutes(db));
  api.use(skillChangeRoutes(db));
  api.use(webhookRoutes(db));
  api.use(mcpEndpointRoutes(db));
  api.use(openApiRoutes());
  api.use(livekitRoutes(db));
  api.use(meetingGuestRoutes(db));
  api.use(pushRoutes(db));
  api.use(meRoutes(db));
  api.use(verifyRoutes(db));
  const hostServicesDisposers = new Map<string, () => void>();
  const workerManager = createPluginWorkerManager();
  const pluginRegistry = pluginRegistryService(db);
  const eventBus = createPluginEventBus();
  setPluginEventBus(eventBus);
  const jobStore = pluginJobStore(db);
  const lifecycle = pluginLifecycleManager(db, { workerManager });
  const scheduler = createPluginJobScheduler({
    db,
    jobStore,
    workerManager,
  });
  const toolDispatcher = createPluginToolDispatcher({
    workerManager,
    lifecycleManager: lifecycle,
    db,
  });
  const jobCoordinator = createPluginJobCoordinator({
    db,
    lifecycle,
    scheduler,
    jobStore,
  });
  const hostServiceCleanup = createPluginHostServiceCleanup(lifecycle, hostServicesDisposers);
  const loader = pluginLoader(
    db,
    { localPluginDir: opts.localPluginDir ?? DEFAULT_LOCAL_PLUGIN_DIR },
    {
      workerManager,
      eventBus,
      jobScheduler: scheduler,
      jobStore,
      toolDispatcher,
      lifecycleManager: lifecycle,
      instanceInfo: {
        instanceId: opts.instanceId ?? "default",
        hostVersion: opts.hostVersion ?? "0.0.0",
      },
      buildHostHandlers: (pluginId, manifest) => {
        const notifyWorker = (method: string, params: unknown) => {
          const handle = workerManager.getWorker(pluginId);
          if (handle) handle.notify(method, params);
        };
        const services = buildHostServices(db, pluginId, manifest.id, eventBus, notifyWorker);
        hostServicesDisposers.set(pluginId, () => services.dispose());
        return createHostClientHandlers({
          pluginId,
          capabilities: manifest.capabilities,
          services,
        });
      },
    },
  );
  api.use(
    pluginRoutes(
      db,
      loader,
      { scheduler, jobStore },
      { workerManager },
      { toolDispatcher },
      { workerManager },
    ),
  );
  api.use(
    accessRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      bindHost: opts.bindHost,
      allowedHostnames: opts.allowedHostnames,
    }),
  );
  app.use("/api", api);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });
  app.use(pluginUiStaticRoutes(db, {
    localPluginDir: opts.localPluginDir ?? DEFAULT_LOCAL_PLUGIN_DIR,
  }));

  app.get(["/dispatch/remote-work", "/dispatch/console"], (req, res, next) => {
    if (req.query.full === "1" || (req.query.lite !== "1" && !isMobileUserAgent(req.get("user-agent")))) {
      next();
      return;
    }
    const origin = `${req.protocol}://${req.get("host") ?? "localhost"}`;
    res
      .status(200)
      .set({
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      })
      .end(buildAmxRemoteWorkMobileHtml(origin));
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (opts.uiMode === "static") {
    // Try published location first (server/ui-dist/), then monorepo dev location (../../ui/dist)
    const candidates = [
      path.resolve(__dirname, "../ui-dist"),
      path.resolve(__dirname, "../../ui/dist"),
    ];
    const uiDist = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
    if (uiDist) {
      const indexHtml = applyUiBranding(fs.readFileSync(path.join(uiDist, "index.html"), "utf-8"));
      app.use("/assets", express.static(path.join(uiDist, "assets")));
      app.use("/assets", (_req, res) => {
        res.status(404).set("Content-Type", "text/plain").end("Not found");
      });
      app.use(
        express.static(uiDist, {
          setHeaders(res, filePath) {
            const basename = path.basename(filePath);
            if (basename === "index.html" || basename === "sw.js" || basename.endsWith(".webmanifest")) {
              res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
              res.setHeader("Pragma", "no-cache");
              res.setHeader("Expires", "0");
            }
          },
        }),
      );
      app.get(/.*/, (req, res) => {
        const requestPath = req.path ?? "";
        if (requestPath.startsWith("/assets/")) {
          res.status(404).set("Content-Type", "text/plain").end("Not found");
          return;
        }
        if (isAssetLikePathname(requestPath)) {
          res.status(404).set("Content-Type", "text/plain").end("Not found");
          return;
        }
        res
          .status(200)
          .set({
            "Content-Type": "text/html",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          })
          .end(indexHtml);
      });
    } else {
      console.warn("[paperclip] UI dist not found; running in API-only mode");
    }
  }

  if (opts.uiMode === "vite-dev") {
    const uiRoot = path.resolve(__dirname, "../../ui");
    const { createServer: createViteServer } = await import("vite");
    const hmrPort = resolveViteHmrPort(opts.serverPort);
    // When bound to a non-loopback host (e.g. 0.0.0.0 in authenticated-private
    // dev), the browser cannot open ws://0.0.0.0:<port>. Leave hmr.host
    // undefined so the client connects via its own page hostname (localhost,
    // tailscale IP, etc.) and use clientPort for the websocket port.
    const isLoopbackBind = ["127.0.0.1", "::1", "localhost"].includes(opts.bindHost);
    const vite = await createViteServer({
      root: uiRoot,
      appType: "custom",
      server: {
        middlewareMode: true,
        hmr: isLoopbackBind
          ? { host: opts.bindHost, port: hmrPort }
          : { port: hmrPort, clientPort: hmrPort },
        allowedHosts: privateHostnameGateEnabled ? Array.from(privateHostnameAllowSet) : undefined,
      },
    });

    app.use(vite.middlewares);
    (app as any).viteServer = vite;
    app.get(/.*/, async (req, res, next) => {
      try {
        if (isAssetLikePathname(req.path)) {
          res.status(404).set("Content-Type", "text/plain").end("Not found");
          return;
        }
        const templatePath = path.resolve(uiRoot, "index.html");
        const template = fs.readFileSync(templatePath, "utf-8");
        const html = applyUiBranding(await vite.transformIndexHtml(req.originalUrl, template));
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.use(errorHandler);

  jobCoordinator.start();
  scheduler.start();
  void ensureOpprcRootStructure();
  const stopOpprrcBackupWorker = startOpprrcBackupWorker(db);
  void toolDispatcher.initialize().catch((err) => {
    logger.error({ err }, "Failed to initialize plugin tool dispatcher");
  });
  const devWatcher = opts.uiMode === "vite-dev"
    ? createPluginDevWatcher(
      lifecycle,
      async (pluginId) => (await pluginRegistry.getById(pluginId))?.packagePath ?? null,
    )
    : null;
  void loader.loadAll().then((result) => {
    if (!result) return;
    for (const loaded of result.results) {
      if (devWatcher && loaded.success && loaded.plugin.packagePath) {
        devWatcher.watch(loaded.plugin.id, loaded.plugin.packagePath);
      }
    }
  }).catch((err) => {
    logger.error({ err }, "Failed to load ready plugins on startup");
  });
  process.once("exit", () => {
    devWatcher?.close();
    stopOpprrcBackupWorker();
    hostServiceCleanup.disposeAll();
    hostServiceCleanup.teardown();
  });
  process.once("beforeExit", () => {
    void flushPluginLogBuffer();
  });

  return app;
}

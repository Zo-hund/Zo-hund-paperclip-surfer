import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import type { Command } from "commander";
import pc from "picocolors";
import type {
  AmxDispatchLease,
  AmxNode,
  AmxNodeCapability,
  AmxNodeConnectionMode,
  AmxNodeKind,
  AmxNodeTrustTier,
} from "@paperclipai/shared";
import { expandHomePrefix, resolvePaperclipHomeDir } from "../config/home.js";
import {
  addCommonClientOptions,
  handleCommandError,
  printOutput,
  resolveCommandContext,
  type BaseClientOptions,
} from "./client/common.js";

interface AmxNodeState {
  version: 1;
  apiBase: string;
  companyId: string;
  nodeId: string;
  nodeName: string;
  publicKeyPem: string;
  privateKeyPem: string;
  capabilities: AmxNodeCapability[];
  allowReadRoots?: string[];
  createdAt: string;
}

interface AmxNodeOptions extends BaseClientOptions {
  state?: string;
}

interface EnrollOptions extends AmxNodeOptions {
  name?: string;
  kind?: AmxNodeKind;
  trustTier?: AmxNodeTrustTier;
  connectionMode?: AmxNodeConnectionMode;
  capabilities?: string;
  label?: string[];
  allowReadRoot?: string[];
  force?: boolean;
}

interface HeartbeatOptions extends AmxNodeOptions {
  status?: "online" | "idle" | "busy" | "degraded";
  capabilities?: string;
  label?: string[];
  posture?: string;
}

interface PollOptions extends AmxNodeOptions {
  consumeLeaseId?: string;
  leaseToken?: string;
}

interface ExecuteOptions extends AmxNodeOptions {
  leaseId: string;
  leaseToken: string;
  out?: string;
  submit?: boolean;
}

const DEFAULT_NODE_STATE_FILE = "amx-node.json";
const MAX_READ_BYTES = 64 * 1024;
const AMX_NODE_CAPABILITY_VALUES = [
  "heartbeat_worker",
  "browser_control",
  "shell",
  "filesystem_read",
  "filesystem_write",
  "screen_stream",
  "input_control",
  "local_models",
  "gpu",
  "camera",
  "microphone",
  "hmd_runtime",
  "cloud_models",
  "docker",
  "git",
  "github_repo",
  "github_actions",
] as const satisfies readonly AmxNodeCapability[];

function resolveStatePath(input?: string): string {
  if (input?.trim()) return path.resolve(expandHomePrefix(input.trim()));
  return path.resolve(resolvePaperclipHomeDir(), DEFAULT_NODE_STATE_FILE);
}

function parseJsonObject(input: string | undefined, label: string): Record<string, unknown> | undefined {
  if (!input?.trim()) return undefined;
  const parsed = JSON.parse(input) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseLabels(input: string[] | undefined): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const item of input ?? []) {
    const separator = item.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Invalid label '${item}'. Use key=value.`);
    }
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!key || !value) throw new Error(`Invalid label '${item}'. Use key=value.`);
    labels[key] = value;
  }
  return labels;
}

function parseCapabilities(input: string | undefined, fallback: AmxNodeCapability[]): AmxNodeCapability[] {
  if (!input?.trim()) return fallback;
  const values = input.split(",").map((part) => part.trim()).filter(Boolean);
  const valid = new Set<string>(AMX_NODE_CAPABILITY_VALUES);
  for (const value of values) {
    if (!valid.has(value)) {
      throw new Error(`Invalid AMX node capability '${value}'. Use one of: ${AMX_NODE_CAPABILITY_VALUES.join(", ")}`);
    }
  }
  return Array.from(new Set(values)) as AmxNodeCapability[];
}

function writeState(filePath: string, state: AmxNodeState, force: boolean): void {
  if (!force && fs.existsSync(filePath)) {
    throw new Error(`AMX node state already exists at ${filePath}. Re-run with --force to replace it.`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function normalizeRoots(input: string[] | undefined): string[] {
  return Array.from(
    new Set((input ?? []).map((entry) => path.resolve(expandHomePrefix(entry.trim()))).filter(Boolean)),
  );
}

function readState(filePath: string): AmxNodeState {
  if (!fs.existsSync(filePath)) {
    throw new Error(`AMX node state not found at ${filePath}. Run \`paperclipai amx-node enroll\` first.`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<AmxNodeState>;
  if (
    parsed.version !== 1 ||
    !parsed.apiBase ||
    !parsed.companyId ||
    !parsed.nodeId ||
    !parsed.privateKeyPem
  ) {
    throw new Error(`Invalid AMX node state at ${filePath}.`);
  }
  return parsed as AmxNodeState;
}

function buildUrl(apiBase: string, requestPath: string): string {
  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  const [pathname, query] = normalizedPath.split("?");
  const url = new URL(apiBase.replace(/\/+$/, ""));
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${pathname}`;
  if (query) url.search = query;
  return url.toString();
}

export function hashAmxBody(body: string): string {
  return createHash("sha256").update(Buffer.from(body, "utf8")).digest("hex");
}

export function buildAmxSignaturePayload(input: {
  method: string;
  pathWithQuery: string;
  timestamp: string;
  body: string;
}): Buffer {
  return Buffer.from(
    [
      input.method.toUpperCase(),
      input.pathWithQuery,
      input.timestamp,
      hashAmxBody(input.body),
    ].join("\n"),
    "utf8",
  );
}

function signedHeaders(input: {
  state: AmxNodeState;
  method: string;
  pathWithQuery: string;
  body: string;
  extra?: Record<string, string>;
}): Record<string, string> {
  const timestamp = new Date().toISOString();
  const payload = buildAmxSignaturePayload({
    method: input.method,
    pathWithQuery: input.pathWithQuery,
    timestamp,
    body: input.body,
  });
  const signature = sign(null, payload, input.state.privateKeyPem).toString("base64url");
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-amx-node-id": input.state.nodeId,
    "x-amx-timestamp": timestamp,
    "x-amx-signature": signature,
    ...input.extra,
  };
}

async function signedRequest<T>(
  state: AmxNodeState,
  requestPath: string,
  input: { method: "GET" | "POST"; body?: unknown; extraHeaders?: Record<string, string> },
): Promise<T | null> {
  const body = input.body === undefined ? "" : JSON.stringify(input.body);
  const url = buildUrl(state.apiBase, requestPath);
  const parsedUrl = new URL(url);
  const pathWithQuery = `${parsedUrl.pathname}${parsedUrl.search}`;
  const response = await fetch(url, {
    method: input.method,
    headers: signedHeaders({
      state,
      method: input.method,
      pathWithQuery,
      body,
      extra: input.extraHeaders,
    }),
    body: input.method === "GET" ? undefined : body,
  });
  const text = await response.text();
  const parsed = text.trim() ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed && "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : `Request failed with status ${response.status}`;
    throw new Error(`AMX node API error ${response.status}: ${message}`);
  }
  return parsed as T | null;
}

function nodeBasePath(state: AmxNodeState): string {
  return `/api/companies/${encodeURIComponent(state.companyId)}/amx-nodes/${encodeURIComponent(state.nodeId)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getStringScope(scope: Record<string, unknown>, key: string): string | undefined {
  const value = scope[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumberScope(scope: Record<string, unknown>, key: string): number | undefined {
  const value = scope[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function isWithinRoot(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveScopedReadPath(state: AmxNodeState, requestedPath: string): string {
  const roots = normalizeRoots(state.allowReadRoots);
  if (roots.length === 0) {
    throw new Error("Local policy rejected filesystem_read: no --allow-read-root was configured at enrollment.");
  }
  const targetPath = path.resolve(expandHomePrefix(requestedPath));
  if (!roots.some((root) => isWithinRoot(targetPath, root))) {
    throw new Error("Local policy rejected filesystem_read: requested path is outside configured read roots.");
  }
  return targetPath;
}

function assertExecutableLease(lease: AmxDispatchLease, state: AmxNodeState): void {
  if (lease.nodeId !== state.nodeId) throw new Error("Local policy rejected lease: node mismatch.");
  if (lease.status !== "granted") throw new Error(`Local policy rejected lease: status is ${lease.status}.`);
  if (new Date(lease.expiresAt).getTime() <= Date.now()) throw new Error("Local policy rejected lease: expired.");
  if (!state.capabilities.includes(lease.capability)) {
    throw new Error(`Local policy rejected lease: node state does not allow capability ${lease.capability}.`);
  }
  if (lease.riskLevel !== "view" && lease.riskLevel !== "read") {
    throw new Error(`Local policy rejected lease: risk level ${lease.riskLevel} requires an explicit executor.`);
  }
}

async function executeLocalReadOnlyLease(state: AmxNodeState, lease: AmxDispatchLease): Promise<Record<string, unknown>> {
  const scope = asRecord(lease.scope);
  if (lease.capability === "heartbeat_worker") {
    return {
      kind: "node_status",
      nodeId: state.nodeId,
      nodeName: state.nodeName,
      platform: os.platform(),
      arch: os.arch(),
      uptimeSeconds: Math.round(os.uptime()),
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      cpuCount: os.cpus().length,
      nodeVersion: process.version,
    };
  }

  if (lease.capability === "filesystem_read") {
    const requestedPath = getStringScope(scope, "path");
    if (!requestedPath) throw new Error("Local policy rejected filesystem_read: scope.path is required.");
    const targetPath = resolveScopedReadPath(state, requestedPath);
    const stats = fs.statSync(targetPath);
    if (stats.isDirectory()) {
      const entries = fs.readdirSync(targetPath, { withFileTypes: true }).slice(0, 200).map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
      }));
      return {
        kind: "directory_listing",
        path: targetPath,
        entryCount: entries.length,
        entries,
      };
    }
    if (!stats.isFile()) throw new Error("Local policy rejected filesystem_read: path is not a file or directory.");
    const maxBytes = Math.min(MAX_READ_BYTES, Math.max(1, Math.trunc(getNumberScope(scope, "maxBytes") ?? 4096)));
    const fd = fs.openSync(targetPath, "r");
    try {
      const bytesToRead = Math.min(Number(stats.size), maxBytes);
      const buffer = Buffer.alloc(bytesToRead);
      const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, 0);
      return {
        kind: "file_preview",
        path: targetPath,
        sizeBytes: stats.size,
        bytesRead,
        truncated: stats.size > bytesRead,
        previewSha256: createHash("sha256").update(buffer.subarray(0, bytesRead)).digest("hex"),
        text: buffer.subarray(0, bytesRead).toString("utf8"),
      };
    } finally {
      fs.closeSync(fd);
    }
  }

  if (lease.capability === "git" || lease.capability === "github_repo") {
    const repoPath = getStringScope(scope, "repoPath") ?? getStringScope(scope, "path") ?? process.cwd();
    const targetPath = resolveScopedReadPath(state, repoPath);
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: targetPath,
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: MAX_READ_BYTES,
      }).trim();
    return {
      kind: "git_repo_status",
      provider: lease.capability === "github_repo" ? "github" : "git",
      repoPath: targetPath,
      repoRoot: git(["rev-parse", "--show-toplevel"]),
      head: git(["rev-parse", "HEAD"]),
      branch: git(["branch", "--show-current"]),
      remotes: git(["remote", "-v"]).split(/\r?\n/).filter(Boolean),
      status: git(["status", "--short", "--branch"]).split(/\r?\n/).filter(Boolean),
      recentCommits: git(["log", "--oneline", "-5"]).split(/\r?\n/).filter(Boolean),
    };
  }

  throw new Error(`Local policy rejected lease: capability ${lease.capability} has no safe executor yet.`);
}

async function executeLease(state: AmxNodeState, leaseId: string, leaseToken: string): Promise<Record<string, unknown>> {
  const leases = await signedRequest<AmxDispatchLease[]>(state, `${nodeBasePath(state)}/dispatch/leases`, {
    method: "GET",
  });
  const lease = (leases ?? []).find((item) => item.id === leaseId);
  if (!lease) throw new Error("Local policy rejected lease: lease is not assigned to this node.");
  assertExecutableLease(lease, state);

  await signedRequest<AmxDispatchLease>(
    state,
    `${nodeBasePath(state)}/dispatch/leases/${encodeURIComponent(leaseId)}/consume`,
    {
      method: "POST",
      body: {},
      extraHeaders: { authorization: `Bearer ${leaseToken}` },
    },
  );

  const result = await executeLocalReadOnlyLease(state, lease);
  return {
    evidenceId: randomUUID(),
    generatedAt: new Date().toISOString(),
    nodeId: state.nodeId,
    companyId: state.companyId,
    leaseId: lease.id,
    capability: lease.capability,
    riskLevel: lease.riskLevel,
    commandSummary: lease.commandSummary,
    status: "executed",
    result,
  };
}

async function submitEvidence(state: AmxNodeState, leaseId: string, evidence: Record<string, unknown>): Promise<unknown> {
  return signedRequest<unknown>(
    state,
    `${nodeBasePath(state)}/dispatch/leases/${encodeURIComponent(leaseId)}/evidence`,
    {
      method: "POST",
      body: {
        evidenceId: evidence.evidenceId,
        status: evidence.status,
        capability: evidence.capability,
        riskLevel: evidence.riskLevel,
        commandSummary: evidence.commandSummary,
        result: asRecord(evidence.result),
        metadata: {
          localGeneratedAt: evidence.generatedAt,
          localNodeId: evidence.nodeId,
        },
        generatedAt: evidence.generatedAt,
      },
    },
  );
}

function writeEvidence(outPath: string | undefined, evidence: Record<string, unknown>): string | null {
  if (!outPath?.trim()) return null;
  const resolved = path.resolve(expandHomePrefix(outPath.trim()));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  return resolved;
}

export function registerAmxNodeCommands(program: Command): void {
  const amxNode = program
    .command("amx-node")
    .description("Enroll and run a signed AMX device node");

  addCommonClientOptions(
    amxNode
      .command("enroll")
      .description("Generate a device keypair and register this machine as an AMX node")
      .option("--state <path>", "AMX node state file")
      .option("--name <name>", "Node display name")
      .option("--kind <kind>", "Node kind", "local_desktop")
      .option("--trust-tier <tier>", "Trust tier", "paired")
      .option("--connection-mode <mode>", "Connection mode", "outbound_websocket")
      .option("--capabilities <list>", "Comma-separated capabilities", "heartbeat_worker")
      .option("--label <key=value...>", "Attach node label", collectOption, [])
      .option("--allow-read-root <path...>", "Allowed root for filesystem_read leases", collectOption, [])
      .option("--force", "Replace an existing local node state file", false)
      .action(async (opts: EnrollOptions) => {
        try {
          const ctx = resolveCommandContext(opts, { requireCompany: true });
          const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
          });
          const capabilities = parseCapabilities(opts.capabilities, ["heartbeat_worker"]);
          const node = await ctx.api.post<AmxNode>(
            `/api/companies/${encodeURIComponent(ctx.companyId!)}/amx-nodes`,
            {
              name: opts.name?.trim() || `${process.env.COMPUTERNAME || process.env.HOSTNAME || "amx-node"}`,
              kind: opts.kind ?? "local_desktop",
              trustTier: opts.trustTier ?? "paired",
              connectionMode: opts.connectionMode ?? "outbound_websocket",
              publicKey,
              capabilities,
              labels: parseLabels(opts.label),
            },
          );
          if (!node) throw new Error("AMX node enrollment returned no node.");
          const statePath = resolveStatePath(opts.state);
          const state: AmxNodeState = {
            version: 1,
            apiBase: ctx.api.apiBase,
            companyId: ctx.companyId!,
            nodeId: node.id,
            nodeName: node.name,
            publicKeyPem: publicKey,
            privateKeyPem: privateKey,
            capabilities,
            allowReadRoots: normalizeRoots(opts.allowReadRoot),
            createdAt: new Date().toISOString(),
          };
          writeState(statePath, state, Boolean(opts.force));
          printOutput({ ok: true, statePath, nodeId: node.id, nodeName: node.name, capabilities }, { json: ctx.json });
          if (!ctx.json) console.log(pc.green("AMX node enrolled. Keep the state file private."));
        } catch (err) {
          handleCommandError(err);
        }
      }),
    { includeCompany: true },
  );

  addNodeCommonOptions(
    amxNode
      .command("heartbeat")
      .description("Send one signed AMX node heartbeat")
      .option("--status <status>", "Node status", "online")
      .option("--capabilities <list>", "Comma-separated capability override")
      .option("--posture <json>", "Posture JSON object")
      .action(async (opts: HeartbeatOptions) => {
        try {
          const state = readState(resolveStatePath(opts.state));
          const capabilities = parseCapabilities(opts.capabilities, state.capabilities);
          const node = await signedRequest<AmxNode>(state, `${nodeBasePath(state)}/heartbeat`, {
            method: "POST",
            body: {
              status: opts.status ?? "online",
              capabilities,
              posture: parseJsonObject(opts.posture, "--posture") ?? {},
            },
          });
          printOutput(node, { json: opts.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addNodeCommonOptions(
    amxNode
      .command("poll")
      .description("List leases assigned to this signed AMX node")
      .option("--consume-lease-id <id>", "Consume one granted lease ID")
      .option("--lease-token <token>", "One-time lease token for --consume-lease-id")
      .action(async (opts: PollOptions) => {
        try {
          const state = readState(resolveStatePath(opts.state));
          if (opts.consumeLeaseId) {
            if (!opts.leaseToken?.trim()) {
              throw new Error("--lease-token is required with --consume-lease-id.");
            }
            const lease = await signedRequest<AmxDispatchLease>(
              state,
              `${nodeBasePath(state)}/dispatch/leases/${encodeURIComponent(opts.consumeLeaseId)}/consume`,
              {
                method: "POST",
                body: {},
                extraHeaders: { authorization: `Bearer ${opts.leaseToken.trim()}` },
              },
            );
            printOutput(lease, { json: opts.json });
            return;
          }

          const leases = await signedRequest<AmxDispatchLease[]>(state, `${nodeBasePath(state)}/dispatch/leases`, {
            method: "GET",
          });
          printOutput(leases ?? [], { json: opts.json });
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );

  addNodeCommonOptions(
    amxNode
      .command("execute")
      .description("Execute one granted read-only AMX dispatch lease with local policy checks")
      .requiredOption("--lease-id <id>", "Granted lease ID assigned to this node")
      .requiredOption("--lease-token <token>", "One-time lease token")
      .option("--out <path>", "Write signed-style evidence JSON to a local file")
      .option("--submit", "Upload evidence back to the AMX OPPRRC intake endpoint", false)
      .action(async (opts: ExecuteOptions) => {
        try {
          const state = readState(resolveStatePath(opts.state));
          const evidence = await executeLease(state, opts.leaseId, opts.leaseToken);
          const submitted = opts.submit ? await submitEvidence(state, opts.leaseId, evidence) : null;
          const evidencePath = writeEvidence(opts.out, evidence);
          printOutput(
            {
              ...evidence,
              ...(evidencePath ? { evidencePath } : {}),
              ...(submitted ? { submitted } : {}),
            },
            { json: opts.json },
          );
        } catch (err) {
          handleCommandError(err);
        }
      }),
  );
}

function addNodeCommonOptions(command: Command): Command {
  return command
    .option("--state <path>", "AMX node state file")
    .option("--json", "Output raw JSON");
}

function collectOption(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

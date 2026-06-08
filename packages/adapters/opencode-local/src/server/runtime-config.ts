import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { asBoolean } from "@paperclipai/adapter-utils/server-utils";

type PreparedOpenCodeRuntimeConfig = {
  env: Record<string, string>;
  notes: string[];
  cleanup: () => Promise<void>;
};

function resolveXdgConfigHome(env: Record<string, string>): string {
  return (
    (typeof env.XDG_CONFIG_HOME === "string" && env.XDG_CONFIG_HOME.trim()) ||
    (typeof process.env.XDG_CONFIG_HOME === "string" && process.env.XDG_CONFIG_HOME.trim()) ||
    path.join(os.homedir(), ".config")
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonObject(filepath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filepath, "utf8");
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function loadAndMapMcpConfig(mcpConfigPath: string): Promise<Record<string, any>> {
  try {
    const raw = await fs.readFile(mcpConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    const mcpServers = parsed.mcpServers;
    if (typeof mcpServers !== "object" || mcpServers === null) return {};

    const mapped: Record<string, any> = {};
    for (const [name, config] of Object.entries(mcpServers)) {
      if (typeof config !== "object" || config === null) continue;
      const c = config as Record<string, any>;
      if (c.type === "http" || c.type === "sse") {
        mapped[name] = {
          type: "remote",
          url: c.url ?? "",
          enabled: true
        };
      } else {
        mapped[name] = {
          type: "local",
          command: c.command ?? "",
          args: c.args ?? [],
          env: c.env ?? {},
          enabled: true
        };
      }
    }
    return mapped;
  } catch {
    return {};
  }
}

export async function prepareOpenCodeRuntimeConfig(input: {
  env: Record<string, string>;
  config: Record<string, unknown>;
  mcpConfigPath?: string;
}): Promise<PreparedOpenCodeRuntimeConfig> {
  const skipPermissions = asBoolean(input.config.dangerouslySkipPermissions, true);
  if (!skipPermissions) {
    return {
      env: input.env,
      notes: [],
      cleanup: async () => {},
    };
  }

  const sourceConfigDir = path.join(resolveXdgConfigHome(input.env), "opencode");
  const runtimeConfigHome = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-config-"));
  const runtimeConfigDir = path.join(runtimeConfigHome, "opencode");
  const runtimeConfigPath = path.join(runtimeConfigDir, "opencode.json");

  await fs.mkdir(runtimeConfigDir, { recursive: true });
  try {
    await fs.cp(sourceConfigDir, runtimeConfigDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
      dereference: false,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code !== "ENOENT") {
      throw err;
    }
  }

  const existingConfig = await readJsonObject(runtimeConfigPath);
  const existingPermission = isPlainObject(existingConfig.permission)
    ? existingConfig.permission
    : {};
  const existingMcp = isPlainObject(existingConfig.mcp) ? existingConfig.mcp : {};

  const mappedMcp = input.mcpConfigPath ? await loadAndMapMcpConfig(input.mcpConfigPath) : {};

  const nextConfig = {
    ...existingConfig,
    permission: {
      ...existingPermission,
      external_directory: "allow",
    },
    mcp: {
      ...existingMcp,
      ...mappedMcp
    }
  };
  await fs.writeFile(runtimeConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  const notes = [
    "Injected runtime OpenCode config with permission.external_directory=allow to avoid headless approval prompts.",
  ];
  if (input.mcpConfigPath && Object.keys(mappedMcp).length > 0) {
    notes.push(`Injected ${Object.keys(mappedMcp).length} MCP server(s) configuration.`);
  }

  return {
    env: {
      ...input.env,
      XDG_CONFIG_HOME: runtimeConfigHome,
    },
    notes,
    cleanup: async () => {
      await fs.rm(runtimeConfigHome, { recursive: true, force: true });
    },
  };
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareOpenCodeRuntimeConfig } from "./runtime-config.js";

const cleanupPaths = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...cleanupPaths].map(async (filepath) => {
      await fs.rm(filepath, { recursive: true, force: true });
      cleanupPaths.delete(filepath);
    }),
  );
});

async function makeConfigHome(initialConfig?: Record<string, unknown>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-test-"));
  cleanupPaths.add(root);
  const configDir = path.join(root, "opencode");
  await fs.mkdir(configDir, { recursive: true });
  if (initialConfig) {
    await fs.writeFile(
      path.join(configDir, "opencode.json"),
      `${JSON.stringify(initialConfig, null, 2)}\n`,
      "utf8",
    );
  }
  return root;
}

describe("prepareOpenCodeRuntimeConfig", () => {
  it("injects an external_directory allow rule by default", async () => {
    const configHome = await makeConfigHome({
      permission: {
        read: "allow",
      },
      theme: "system",
    });

    const prepared = await prepareOpenCodeRuntimeConfig({
      env: { XDG_CONFIG_HOME: configHome },
      config: {},
    });
    cleanupPaths.add(prepared.env.XDG_CONFIG_HOME);

    expect(prepared.env.XDG_CONFIG_HOME).not.toBe(configHome);
    const runtimeConfig = JSON.parse(
      await fs.readFile(
        path.join(prepared.env.XDG_CONFIG_HOME, "opencode", "opencode.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(runtimeConfig).toMatchObject({
      theme: "system",
      permission: {
        read: "allow",
        external_directory: "allow",
      },
    });

    await prepared.cleanup();
    cleanupPaths.delete(prepared.env.XDG_CONFIG_HOME);
    await expect(fs.access(prepared.env.XDG_CONFIG_HOME)).rejects.toThrow();
  });

  it("respects explicit opt-out", async () => {
    const configHome = await makeConfigHome();
    const prepared = await prepareOpenCodeRuntimeConfig({
      env: { XDG_CONFIG_HOME: configHome },
      config: { dangerouslySkipPermissions: false },
    });

    expect(prepared.env).toEqual({ XDG_CONFIG_HOME: configHome });
    expect(prepared.notes).toEqual([]);
    await prepared.cleanup();
  });

  it("parses and merges MCP configuration path", async () => {
    const configHome = await makeConfigHome({
      theme: "system",
      mcp: {
        existing: {
          type: "local",
          command: "node",
          args: ["existing.js"],
          enabled: false
        }
      }
    });

    const mcpConfigRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-mcp-test-"));
    const mcpConfigPath = path.join(mcpConfigRoot, "mcp-config.json");
    await fs.writeFile(
      mcpConfigPath,
      JSON.stringify({
        mcpServers: {
          "http-server": {
            type: "http",
            url: "https://mcp.example.com"
          },
          "stdio-server": {
            command: "npx",
            args: ["stdio.js"],
            env: { DEBUG: "true" }
          }
        }
      }),
      "utf8"
    );

    const prepared = await prepareOpenCodeRuntimeConfig({
      env: { XDG_CONFIG_HOME: configHome },
      config: {},
      mcpConfigPath,
    });
    cleanupPaths.add(prepared.env.XDG_CONFIG_HOME);

    const runtimeConfig = JSON.parse(
      await fs.readFile(
        path.join(prepared.env.XDG_CONFIG_HOME, "opencode", "opencode.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;

    expect(runtimeConfig.mcp).toEqual({
      existing: {
        type: "local",
        command: "node",
        args: ["existing.js"],
        enabled: false
      },
      "http-server": {
        type: "remote",
        url: "https://mcp.example.com",
        enabled: true
      },
      "stdio-server": {
        type: "local",
        command: "npx",
        args: ["stdio.js"],
        env: { DEBUG: "true" },
        enabled: true
      }
    });

    expect(prepared.notes).toContain("Injected 2 MCP server(s) configuration.");

    await prepared.cleanup();
    cleanupPaths.delete(prepared.env.XDG_CONFIG_HOME);
    await fs.rm(mcpConfigRoot, { recursive: true, force: true });
  });
});

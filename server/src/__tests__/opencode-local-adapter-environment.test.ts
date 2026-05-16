import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { testEnvironment } from "@paperclipai/adapter-opencode-local/server";

async function writeFakeOpencodeCommand(
  binDir: string,
  mode: "ok" | "model_not_found",
): Promise<string> {
  const commandPath = path.join(binDir, process.platform === "win32" ? "opencode.cmd" : "opencode");
  if (process.platform === "win32") {
    const script = mode === "model_not_found"
      ? "@echo off\r\necho ProviderModelNotFoundError: ProviderModelNotFoundError 1>&2\r\nexit /b 1\r\n"
      : "@echo off\r\nif \"%1\"==\"models\" (echo openai/gpt-5.3-codex & exit /b 0)\r\necho {\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"output_text\",\"text\":\"hello\"}]}}\r\necho {\"type\":\"result\",\"subtype\":\"success\",\"result\":\"hello\"}\r\nexit /b 0\r\n";
    await fs.writeFile(commandPath, script, "utf8");
    return commandPath;
  }
  const script = mode === "model_not_found"
    ? "#!/bin/sh\necho 'ProviderModelNotFoundError: ProviderModelNotFoundError' 1>&2\nexit 1\n"
    : "#!/bin/sh\nif [ \"$1\" = \"models\" ]; then\n  echo 'openai/gpt-5.3-codex'\n  exit 0\nfi\necho '{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"output_text\",\"text\":\"hello\"}]}}'\necho '{\"type\":\"result\",\"subtype\":\"success\",\"result\":\"hello\"}'\nexit 0\n";
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
  return commandPath;
}

describe("opencode_local environment diagnostics", () => {
  it("reports a missing working directory as an error when cwd is absolute", async () => {
    const cwd = path.join(
      os.tmpdir(),
      `paperclip-opencode-local-cwd-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      "workspace",
    );

    await fs.rm(path.dirname(cwd), { recursive: true, force: true });

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "opencode_local",
      config: {
        command: "__paperclip_missing_opencode_command__",
        cwd,
      },
    });

    expect(result.checks.some((check) => check.code === "opencode_cwd_invalid")).toBe(true);
    expect(result.checks.some((check) => check.level === "error")).toBe(true);
    expect(result.status).toBe("fail");
  });

  it("treats an empty OPENAI_API_KEY override as missing", async () => {
    if (process.platform === "win32") return;
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-env-empty-key-"));
    const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-env-empty-key-bin-"));
    const fakeCommand = await writeFakeOpencodeCommand(binDir, "ok");
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-host-value";

    try {
      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "opencode_local",
        config: {
          command: fakeCommand,
          cwd,
          env: {
            OPENAI_API_KEY: "",
          },
        },
      });

      const missingCheck = result.checks.find((check) => check.code === "opencode_openai_api_key_missing");
      expect(missingCheck).toBeTruthy();
      expect(missingCheck?.hint).toContain("empty");
    } finally {
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(binDir, { recursive: true, force: true });
    }
  });

  it("classifies ProviderModelNotFoundError probe output as model-unavailable warning", async () => {
    if (process.platform === "win32") return;
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-env-probe-cwd-"));
    const binDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-env-probe-bin-"));
    const fakeOpencode = await writeFakeOpencodeCommand(binDir, "model_not_found");

    try {
      const result = await testEnvironment({
        companyId: "company-1",
        adapterType: "opencode_local",
        config: {
          command: fakeOpencode,
          cwd,
        },
      });

      const modelCheck = result.checks.find((check) => check.code === "opencode_hello_probe_model_unavailable");
      expect(modelCheck).toBeTruthy();
      expect(modelCheck?.level).toBe("warn");
      expect(result.status).toBe("warn");
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
      await fs.rm(binDir, { recursive: true, force: true });
    }
  });
});

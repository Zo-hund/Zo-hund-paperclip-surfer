import { describe, expect, it, vi } from "vitest";
import { sessionCodec, testEnvironment } from "@paperclipai/adapter-openrouter/server";
import { parseStdoutLine } from "@paperclipai/adapter-openrouter/ui";
import { printOpenRouterStreamEvent } from "@paperclipai/adapter-openrouter/cli";

describe("OpenRouter sessionCodec", () => {
  it("serializes and deserializes messages correctly", () => {
    const params = {
      messages: [{ role: "user", content: "hello" }],
      cwd: "/test/cwd",
    };
    const serialized = sessionCodec.serialize(params);
    expect(serialized).toEqual(params);

    const deserialized = sessionCodec.deserialize(serialized);
    expect(deserialized).toEqual(params);
  });

  it("handles empty/null deserialize gracefully", () => {
    expect(sessionCodec.deserialize(null)).toBeNull();
    expect(sessionCodec.deserialize({})).toBeNull();
  });

  it("returns turn count as display ID", () => {
    const displayId = sessionCodec.getDisplayId?.({
      messages: [{ role: "user" }, { role: "assistant" }],
    });
    expect(displayId).toBe("openrouter-2-turns");
  });
});

describe("OpenRouter UI parseStdoutLine", () => {
  const ts = "2026-06-08T12:00:00.000Z";

  it("parses system turn status", () => {
    const line = "[OpenRouter Turn 1/20] Sending request to model...";
    expect(parseStdoutLine(line, ts)).toEqual([
      { kind: "system", ts, text: line },
    ]);
  });

  it("parses tool execution call", () => {
    const line = '[Tool Call] Executing write_file with args: {"filePath":"test.txt","content":"hello"}';
    expect(parseStdoutLine(line, ts)).toEqual([
      {
        kind: "tool_call",
        ts,
        name: "write_file",
        input: { filePath: "test.txt", content: "hello" },
      },
    ]);
  });

  it("parses tool execution result", () => {
    const line = "[Tool Result] File successfully written";
    expect(parseStdoutLine(line, ts)).toEqual([
      {
        kind: "tool_result",
        ts,
        toolUseId: "openrouter-tool",
        content: "File successfully written",
        isError: false,
      },
    ]);
  });

  it("parses tool error result", () => {
    const line = "[Tool Result] Error: Access denied";
    expect(parseStdoutLine(line, ts)).toEqual([
      {
        kind: "tool_result",
        ts,
        toolUseId: "openrouter-tool",
        content: "Access denied",
        isError: true,
      },
    ]);
  });

  it("defaults to assistant kind for standard text", () => {
    const line = "The solution is to use Vitest.";
    expect(parseStdoutLine(line, ts)).toEqual([
      { kind: "assistant", ts, text: line },
    ]);
  });
});

describe("OpenRouter CLI printOpenRouterStreamEvent", () => {
  it("logs messages and colorizes accordingly", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      printOpenRouterStreamEvent("[OpenRouter Turn 1/20] Sending request...", false);
      printOpenRouterStreamEvent("[Tool Call] Executing write_file with args: ...", false);
      printOpenRouterStreamEvent("[Tool Result] Success", false);
      printOpenRouterStreamEvent("[Tool Result] Error: Access denied", false);
      printOpenRouterStreamEvent("Hello standard output", false);

      expect(spy).toHaveBeenCalledTimes(5);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("OpenRouter testEnvironment check", () => {
  it("fails test when API key is missing", async () => {
    const result = await testEnvironment({
      companyId: "comp-1",
      adapterType: "openrouter",
      config: {
        model: "openai/gpt-4o",
        env: {},
      },
    });
    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "api_key_missing")).toBe(true);
  });

  it("passes test when API key and model are configured", async () => {
    const result = await testEnvironment({
      companyId: "comp-1",
      adapterType: "openrouter",
      config: {
        model: "openai/gpt-4o",
        env: {
          OPENROUTER_API_KEY: "sk-or-test-key",
        },
      },
    });
    expect(result.status).toBe("pass");
    expect(result.checks.some((c) => c.code === "api_key_configured")).toBe(true);
    expect(result.checks.some((c) => c.code === "model_configured")).toBe(true);
  });
});

import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";

/**
 * Hermes Advanced Adapter (Nous Research)
 * 
 * Provides high-fidelity agent reasoning, browser automation, and 
 * standardized reporting via the Paperclip Hermes MCP bridge.
 */

const hermesAdvancedAdapter: ServerAdapterModule = {
  type: "hermes_advanced",
  execute,
  testEnvironment: async () => ({
    adapterType: "hermes_advanced",
    status: "pass",
    checks: [],
    testedAt: new Date().toISOString(),
  }),
  models: [
    { id: "anthropic/claude-3-5-sonnet", label: "Claude 3.5 Sonnet (Hermes Native)" },
    { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash (Fast Reasoning)" },
    { id: "nousresearch/hermes-3-llama-3.1-405b", label: "Hermes 3 / Llama 3.1 405b" },
  ],
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: "https://github.com/nousresearch/hermes-agent",
};

export { hermesAdvancedAdapter };

export const type = "openrouter";
export const label = "OpenRouter";

export const models = [
  { id: "~moonshotai/kimi-latest", label: "MoonshotAI Kimi Latest" },
  { id: "moonshotai/kimi-k2.6-20260420", label: "MoonshotAI Kimi K2.6" },
  { id: "moonshotai/kimi-k2.6:free", label: "MoonshotAI Kimi K2.6 (free)" },
  { id: "moonshotai/kimi-k2.5", label: "MoonshotAI Kimi K2.5" },
  { id: "moonshotai/kimi-k2", label: "MoonshotAI Kimi K2 0711" },
  { id: "minimax/minimax-m3", label: "MiniMax M3" },
  { id: "minimax/minimax-m2.7", label: "MiniMax M2.7" },
  { id: "minimax/minimax-m2.1", label: "MiniMax M2.1" },
  { id: "minimax/minimax-m2", label: "MiniMax M2" },
  { id: "minimax/minimax-01", label: "MiniMax-01" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "meta-llama/llama-3-70b-instruct", label: "Llama 3 70B" },
  { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
];

export const agentConfigurationDoc = `# OpenRouter Agent Configuration

Adapter: openrouter

Use when:
- You want the agent to use OpenRouter to access a wide range of LLMs (Kimi, MiniMax, Llama, DeepSeek, Claude, etc.) via API.
- You need structured tool executions locally inside the workspace on VPS or local host.
- You want cloud-native, no-binary agent execution (no local CLI installation required).

Don't use when:
- The host or VPS has no outbound internet access to openrouter.ai.

Core fields:
- cwd (string, optional): absolute working directory for execution
- model (string, required): model name on OpenRouter (e.g. "moonshotai/kimi-k2.6-20260420", "minimax/minimax-m3", or "anthropic/claude-3.5-sonnet")
- env (object, optional): environment overrides containing "OPENROUTER_API_KEY"
`;

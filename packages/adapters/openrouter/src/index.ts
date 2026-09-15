export const type = "openrouter";
export const label = "OpenRouter";

export const models = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
  { id: "openai/gpt-4o", label: "GPT-4o" },
  { id: "meta-llama/llama-3-70b-instruct", label: "Llama 3 70B" },
  { id: "google/gemini-flash-1.5", label: "Gemini Flash 1.5" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
];

export const agentConfigurationDoc = `# OpenRouter Agent Configuration

Adapter: openrouter

Credentials: an explicit OPENROUTER_API_KEY env secret reference takes priority, followed by the company's encrypted default in Company settings. Server-key access requires the operator to list the company UUID in PAPERCLIP_OPENROUTER_COMPANY_IDS. Rejected keys never fall back to another billing account. Test environment validates the selected key with OpenRouter without running inference.

Use when:
- You want the agent to use OpenRouter to access a wide range of LLMs (Llama 3, DeepSeek, GPT-4o mini, etc.) via API.
- You need structured tool executions locally inside the workspace on VPS or local host.
- You want cloud-native, no-binary agent execution (no local CLI installation required).

Don't use when:
- The host or VPS has no outbound internet access to openrouter.ai.

Core fields:
- cwd (string, optional): absolute working directory for execution
- model (string, required): model name on OpenRouter (e.g. "openai/gpt-4o-mini")
- env (object, optional): environment overrides containing "OPENROUTER_API_KEY"
`;

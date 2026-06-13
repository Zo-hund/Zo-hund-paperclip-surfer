export const type = "opencode_local";
export const label = "OpenCode (local)";

export const models: Array<{ id: string; label: string }> = [
  { id: "openrouter/~moonshotai/kimi-latest", label: "OpenRouter - MoonshotAI Kimi Latest" },
  { id: "openrouter/moonshotai/kimi-k2.6-20260420", label: "OpenRouter - MoonshotAI Kimi K2.6" },
  { id: "openrouter/moonshotai/kimi-k2.6:free", label: "OpenRouter - MoonshotAI Kimi K2.6 (free)" },
  { id: "openrouter/moonshotai/kimi-k2.5", label: "OpenRouter - MoonshotAI Kimi K2.5" },
  { id: "openrouter/moonshotai/kimi-k2", label: "OpenRouter - MoonshotAI Kimi K2 0711" },
  { id: "openrouter/minimax/minimax-m3", label: "OpenRouter - MiniMax M3" },
  { id: "openrouter/minimax/minimax-m2.7", label: "OpenRouter - MiniMax M2.7" },
  { id: "openrouter/minimax/minimax-m2.1", label: "OpenRouter - MiniMax M2.1" },
  { id: "openrouter/minimax/minimax-m2", label: "OpenRouter - MiniMax M2" },
  { id: "openrouter/minimax/minimax-01", label: "OpenRouter - MiniMax-01" },
];

export const agentConfigurationDoc = `# opencode_local agent configuration

Adapter: opencode_local

Use when:
- You want Paperclip to run OpenCode locally as the agent runtime
- You want provider/model routing in OpenCode format (provider/model), including OpenRouter-hosted Kimi and MiniMax models
- You want OpenCode session resume across heartbeats via --session

Don't use when:
- You need webhook-style external invocation (use openclaw_gateway or http)
- You only need one-shot shell commands (use process)
- OpenCode CLI is not installed on the machine

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the run prompt
- model (string, required): OpenCode model id in provider/model format (for example anthropic/claude-sonnet-4-5, openrouter/moonshotai/kimi-k2.6-20260420, or openrouter/minimax/minimax-m3)
- variant (string, optional): provider-specific model variant (for example minimal|low|medium|high|max)
- dangerouslySkipPermissions (boolean, optional): inject a runtime OpenCode config that allows \`external_directory\` access without interactive prompts; defaults to true for unattended Paperclip runs
- promptTemplate (string, optional): run prompt template
- command (string, optional): defaults to "opencode"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- OpenCode supports multiple providers and models. Use \
  \`opencode models\` to list available options in provider/model format.
- Paperclip requires an explicit \`model\` value for \`opencode_local\` agents.
- Runs are executed with: opencode run --format json ...
- Sessions are resumed with --session when stored session cwd matches current cwd.
- The adapter sets OPENCODE_DISABLE_PROJECT_CONFIG=true to prevent OpenCode from \
  writing an opencode.json config file into the project working directory. Model \
  selection is passed via the --model CLI flag instead.
- When \`dangerouslySkipPermissions\` is enabled, Paperclip injects a temporary \
  runtime config with \`permission.external_directory=allow\` so headless runs do \
  not stall on approval prompts.
`;

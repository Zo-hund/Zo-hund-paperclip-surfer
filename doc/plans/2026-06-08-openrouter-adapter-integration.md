# 2026-06-08 OpenRouter Adapter Integration

Design and integration plan for adding the OpenRouter adapter to support more models, tools, and cross-platform (local & cloud/VPS) capabilities.

## 1. Context and Problem Statement
Currently, Paperclip features CLI-dependent adapters (`claude-local`, `gemini-local`, `cursor-local`) and WebSocket/gateway adapters (`openclaw-gateway`).
To enable cloud tenants on VPS deployments to use a wider range of open-source and proprietary models (such as Llama 3, DeepSeek, Claude 3.5, and GPT-4o) without installing local model-specific binaries, we will integrate **OpenRouter** as a first-class adapter package (`@paperclipai/adapter-openrouter`).

---

## 2. Proposed Architecture

### 2.1 The OpenRouter Adapter Package (`packages/adapters/openrouter`)
We will create a self-contained adapter conforming to the `ServerAdapterModule` and `UIAdapterModule` interfaces:
1. **Root Module (`packages/adapters/openrouter/src/index.ts`)**:
   - Exposes `type = "openrouter"`.
   - Defines popular OpenRouter models (e.g., `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3-70b-instruct`, `google/gemini-pro-1.5`, `openai/gpt-4o-mini`).
2. **Server Execution (`src/server/execute.ts`)**:
   - Since OpenRouter does not have a local binary, the adapter will implement a **lightweight Node.js-based agent loop** that runs directly within the execution run process.
   - It will use `fetch` to request completions from `https://openrouter.ai/api/v1/chat/completions`.
   - It will support streaming chat responses to `onLog("stdout", ...)` for real-time visibility in the run viewer.
   - It will support **session resume** by persisting the conversation history (thread parameters) in `sessionParams`.
3. **Tool Injection**:
   - The loop will define standard system tools (e.g., `run_command`, `read_file`, `write_file`, `search_web`) and serialize them as OpenAI-compatible function definitions in the OpenRouter API payload.
   - When OpenRouter returns a `tool_calls` request, the server execute loop will run the command locally in the workspace, append the `tool_result`, and request the next completion turn.

### 2.2 Configuration Schema
Tenants will configure their agent using:
```json
{
  "model": "anthropic/claude-3.5-sonnet",
  "env": {
    "OPENROUTER_API_KEY": "sk-or-v1-..."
  }
}
```
API keys are loaded securely from Drizzle (`agent_api_keys` or environment variables) and redacted in execution logs using `redactEnvForLogs()`.

---

## 3. FAQ: How the Platform Works

### Q: What is OpenRouter?
OpenRouter is a unified router for LLM completions. It provides an OpenAI-compatible interface to hundreds of open-source and proprietary models, handling rate limits, billing, and model load balancing behind a single API.

### Q: How do agents execute work in local vs. cloud (VPS) environments?
1. **Local Dev**: The agent runs within a local workspace directory (`cwd`) on your machine.
2. **Cloud/VPS**: Paperclip provisions a linked worktree workspace on the VPS. When the agent wakes up, it connects to OpenRouter via HTTP to generate thoughts and tool requests. The tool requests (like filesystem read/write or terminal command execution) are executed safely inside the sandboxed cloud workspace on the VPS.

### Q: How does memory persistence work?
During a heartbeat run, the server queries the database for all global and project memories belonging to that agent. These are appended to the system prompt of the OpenRouter completions call. The agent reads this context and can write new memories back via `POST /api/agents/me/memories` at the end of the run.

### Q: How is billing and budget handled?
Paperclip tracks token usage and cost reported by OpenRouter in the database billing ledger. Every agent run checks the company's monthly budget limits. If a tenant's budget is exceeded, the heartbeats automatically pause agent execution.

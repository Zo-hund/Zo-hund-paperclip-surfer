# AMX Air Hubs (amx-air-hubs.cc) — OpenRouter & Platform Architecture FAQ

This document explains how OpenRouter works within the AMX Air Hubs platform and details the core platform mechanics under both local development and cloud (VPS) environments for our clients.

---

## 1. Core Mechanics

### Q: What is OpenRouter?
**OpenRouter** is a unified LLM completion router. It provides an OpenAI-compatible interface to hundreds of open-source and proprietary models (such as Claude 3.5 Sonnet, GPT-4o, Llama 3, Gemini, and DeepSeek), handling rate limits, client-side billing, and model load balancing behind a single API endpoint. This allows paying tenants/clients on AMX Air Hubs to utilize any model in the catalog (free and paid) seamlessly.

### Q: How do clients configure OpenRouter on amx-air-hubs.cc?
1. Create or invite an agent and choose **OpenRouter** as the adapter.
2. Select one of the pre-configured models (e.g., `deepseek/deepseek-chat`, `anthropic/claude-3.5-sonnet`) or input any custom model identifier from OpenRouter's extensive catalog.
3. In the agent's **Environment variables** section, add your `OPENROUTER_API_KEY`.
   - Alternatively, keys can be set as **Company Secrets** and referenced securely as bindings (e.g. `OPENROUTER_API_KEY = secret_ref(my_secret_id)`).

---

## 2. Environment Execution Models

### Q: How do agents execute work in local vs. cloud (VPS) environments?

AMX Air Hubs supports flexible agent runtimes:

1. **Local Development Mode**:
   - The agent runner executes within the same host process.
   - Command tools (such as `run_command` via powershell/bash) and filesystem tools (`read_file`, `write_file`, `list_dir`) are executed directly on the local machine's filesystem under the configured working directory (`cwd`).
   - Network requests to the OpenRouter completions API are made from the local machine.

2. **Cloud/VPS Deployment Mode**:
   - AMX Air Hubs provisions an isolated worktree/workspace inside the VPS environment.
   - When the agent runner executes a heartbeat run, it connects to OpenRouter via outbound HTTPS requests to generate thoughts and tool requests.
   - The tool commands are executed safely and performantly inside the sandboxed VPS workspace. This allows secure, remote execution without exposing host-level permissions.

---

## 3. State, Memory, & Billing

### Q: How does memory persistence work for clients?
AMX Air Hubs operates on a two-tier memory architecture (Global and Project memories):
- **Read**: When an agent wakes up during a heartbeat run, the server queries the database for all global and project memories belonging to that agent. These are appended to the agent's system prompt context.
- **Write**: The agent can register new insights at any time. At the end of a run, the agent makes a POST request to `/api/agents/me/memories` using its runtime token. These memories are persisted in the PostgreSQL database and will be present in all subsequent runs.

### Q: How are billing and budgets handled?
- **Tenants Pay for Consumption**: Each tenant configures their own `OPENROUTER_API_KEY`, ensuring they pay OpenRouter directly for token consumption.
- **AMX Air Hubs Budget Limits**: The platform parses the usage metadata returned in OpenRouter completion payloads (`prompt_tokens`, `completion_tokens`) and tracks cumulative costs in the database billing ledger. If a tenant's monthly budget limit is exceeded, AMX Air Hubs heartbeats will automatically pause agent execution.


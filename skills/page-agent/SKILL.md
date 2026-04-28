# page-agent

Control and automate any web page using natural language instructions. Powered by the `page-agent` library (alibaba/page-agent).

## What this skill does

Gives every AMX-LABS agent the ability to:
- **Execute** natural-language browser actions against any URL (`click`, `fill`, `navigate`, `screenshot`, `extract`)
- **Show** an interactive panel so a human can type instructions live
- **Compose** multi-step workflows — "fill the form, submit, then extract the confirmation number"

## Installation (in project)

```sh
npm install page-agent
# or
pnpm add page-agent
```

## Initialization

```ts
import { PageAgent } from 'page-agent';

const agent = new PageAgent({
  model: 'qwen3.5-plus',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.PAGE_AGENT_API_KEY,
  language: 'en-US',
});
```

For local/demo use (no API key required — uses free test LLM):

```html
<script src="https://cdn.jsdelivr.net/npm/page-agent@1.7.1/dist/iife/page-agent.demo.js" crossorigin="true"></script>
```

## Core API

### `agent.execute(instruction: string)`

Run a natural-language instruction against the current page.

```ts
// Single action
await agent.execute('Click the Submit button');

// Multi-step
await agent.execute('Fill username as John, fill password as secret, then click Login');

// Data extraction
const result = await agent.execute('Extract all product names and prices from the table');

// Navigation + interaction
await agent.execute('Navigate to the settings page and enable dark mode');
```

### `agent.panel.show()`

Display a floating input panel on the page so a user can type instructions interactively.

```ts
agent.panel.show();  // shows overlay panel
agent.panel.hide();  // hides it
```

### `PageAgentCore` (headless / Node.js)

```ts
import { PageAgentCore } from 'page-agent';

const core = new PageAgentCore({
  model: 'qwen3.5-plus',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.PAGE_AGENT_API_KEY,
});

// Pass your own page controller
await core.execute(pageController, 'Fill out the registration form');
```

### `PageController`

Implement this interface to connect page-agent to any browser automation driver (Playwright, Puppeteer, CDP, etc.):

```ts
interface PageController {
  getPageContent(): Promise<string>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  navigate(url: string): Promise<void>;
  screenshot(): Promise<Buffer>;
  evaluate(script: string): Promise<unknown>;
}
```

## Agent Use Cases

| Agent | How to use page-agent |
|---|---|
| **CMO** | Automate social media scheduling UIs, extract analytics data, post content |
| **CTO** | Run browser-based smoke tests, fill CI forms, scrape error dashboards |
| **CEO** | Extract competitor pricing, fill out grant/funding application forms |
| **Auditor** | Screenshot and log page states for compliance records |
| **Any agent** | Automate any web-based tool that lacks an API |

## Supported Models

| Provider | Model IDs |
|---|---|
| Alibaba DashScope | `qwen3.5-plus`, `qwen-max`, `qwen-turbo` |
| OpenAI | `gpt-4o`, `gpt-4-turbo` |
| Anthropic | `claude-opus-4-6`, `claude-sonnet-4-6` |
| Custom | Any OpenAI-compatible endpoint via `baseURL` |

## Environment Variables

```
PAGE_AGENT_API_KEY=your_llm_api_key
PAGE_AGENT_MODEL=qwen3.5-plus
PAGE_AGENT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
PAGE_AGENT_LANGUAGE=en-US
```

## Limitations

- Requires browser context (DOM access) for full `PageAgent`; use `PageAgentCore` for Node.js/headless
- Actions execute sequentially — parallel execution requires multiple instances
- Complex visual layouts may need extra instruction clarity
- Rate limits apply per the underlying LLM provider

## Memory & State

page-agent is stateless per `execute()` call. For persistent memory across sessions, store extracted data in Paperclip issue documents or AMX Chain ledger entries and re-inject as context in subsequent instructions.

```ts
// Save extracted data to Paperclip issue
const data = await agent.execute('Extract all client names from the CRM table');
await issuesApi.addComment(issueId, { body: `Extracted: ${data}` });

// Re-inject in next session
const memory = await getLastComment(issueId);
await agent.execute(`Context: ${memory}\n\nNow update the status for each client`);
```

## Reference

- GitHub: https://github.com/alibaba/page-agent
- npm: https://www.npmjs.com/package/page-agent
- Docs: https://page-agent.alibaba.com

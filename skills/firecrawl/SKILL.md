# Firecrawl Skill

Power agents with clean web data. Firecrawl converts any URL into LLM-ready markdown, structured JSON, or screenshots — handling JS rendering, proxies, and rate limits automatically.

**Source repo**: `C:/Users/Techa/.paperclip/tmp_surfers/firecrawl` (cloned from github.com/mendableai/firecrawl)

## Installation

```sh
npm install firecrawl
# or
pnpm add firecrawl
```

## Initialization

```ts
import FirecrawlApp from 'firecrawl';

const app = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY,
  // apiUrl: 'http://localhost:3002', // self-hosted instance
});
```

For self-hosted (no API key needed — runs on localhost):
```ts
const app = new FirecrawlApp({ apiUrl: 'http://localhost:3002' });
```

## Core API

### `scrapeUrl(url, params?)` — Single page
Extract content from one URL.

```ts
// Basic markdown extraction
const result = await app.scrapeUrl('https://example.com');
if (result.success) {
  console.log(result.markdown);
}

// Multiple formats
const result = await app.scrapeUrl('https://example.com', {
  formats: ['markdown', 'html', 'screenshot'],
  waitFor: 2000,           // ms to wait for JS
  timeout: 30000,
  onlyMainContent: true,   // strips nav/footer/ads
  includeTags: ['article', 'main'],
  excludeTags: ['nav', 'footer', 'aside'],
});

// Structured JSON extraction with schema
import { z } from 'zod';
const schema = z.object({
  title: z.string(),
  price: z.number(),
  inStock: z.boolean(),
});
const result = await app.scrapeUrl('https://shop.example.com/product', {
  formats: ['extract'],
  extract: { schema },
});
console.log(result.extract); // typed as { title, price, inStock }

// Page actions before scraping (click, fill, scroll)
const result = await app.scrapeUrl('https://example.com/login', {
  formats: ['markdown'],
  actions: [
    { type: 'click', selector: '#accept-cookies' },
    { type: 'wait', milliseconds: 1000 },
    { type: 'scroll', direction: 'down', amount: 3 },
  ],
});
```

### `crawlUrl(url, params?)` — Multi-page crawl

```ts
const result = await app.crawlUrl('https://docs.example.com', {
  limit: 50,                        // max pages
  maxDepth: 3,
  excludePaths: ['blog/*', 'changelog/*'],
  includePaths: ['docs/*'],
  scrapeOptions: {
    formats: ['markdown'],
    onlyMainContent: true,
  },
});
// result.data = array of FirecrawlDocument
for (const page of result.data) {
  console.log(page.url, page.markdown);
}

// Watch for live updates (WebSocket stream)
const watcher = await app.crawlUrlAndWatch('https://example.com', { limit: 20 });
watcher.addEventListener('document', (e) => console.log(e.detail.data));
watcher.addEventListener('done', (e) => console.log('Done', e.detail.status));
```

### `search(query, params?)` — Web search + extract

```ts
const result = await app.search('latest AI news', {
  limit: 10,
  scrapeOptions: {
    formats: ['markdown'],
    onlyMainContent: true,
  },
  location: { country: 'US', languages: ['en'] },
});
for (const item of result.data) {
  console.log(item.url, item.markdown);
}
```

### `mapUrl(url, params?)` — Site structure discovery

```ts
const result = await app.mapUrl('https://example.com', {
  search: 'pricing',     // filter URLs by keyword
  limit: 200,
  includeSubdomains: false,
});
console.log(result.links); // string[] of all discovered URLs
```

### `batchScrapeUrls(urls, params?)` — Parallel scrape

```ts
const result = await app.batchScrapeUrls(
  ['https://example.com/page1', 'https://example.com/page2'],
  { formats: ['markdown', 'extract'], extract: { schema } }
);
// result.data = array of FirecrawlDocument

// Stream results as they complete
const watcher = await app.batchScrapeUrlsAndWatch(urls, { formats: ['markdown'] });
watcher.addEventListener('document', (e) => console.log(e.detail.data.url));
```

### `extract(urls?, params?)` — AI-structured extraction

```ts
import { z } from 'zod';
const schema = z.object({
  companyName: z.string(),
  foundedYear: z.number(),
  employees: z.number().optional(),
  products: z.array(z.string()),
});

const result = await app.extract(
  ['https://company.com', 'https://company.com/about'],
  {
    schema,
    prompt: 'Extract company details. Focus on founding year and product list.',
  }
);
console.log(result.data); // typed as { companyName, foundedYear, ... }
```

### `generateLLMsText(url, params?)` — llms.txt generation

```ts
const result = await app.generateLLMsText('https://docs.example.com', {
  maxUrls: 10,
  showFullText: true,
});
console.log(result.data?.llmsFullTxt); // clean text for LLM context
```

## Return Type Reference

All methods return `{ success: boolean, error?: string, ...data }`.

| Field | Type | Available on |
|---|---|---|
| `markdown` | `string` | scrape, crawl, search |
| `html` | `string` | scrape |
| `rawHtml` | `string` | scrape |
| `links` | `string[]` | scrape, map |
| `extract` | `T` | scrape (with schema) |
| `json` | `T` | scrape (jsonOptions) |
| `screenshot` | `string` (base64) | scrape |
| `metadata.title` | `string` | scrape |
| `metadata.statusCode` | `number` | scrape |
| `metadata.creditsUsed` | `number` | scrape |
| `changeTracking` | `object` | scrape (changeTracking mode) |

## Agent Use Cases

| Task | Method | Notes |
|---|---|---|
| Read a web page | `scrapeUrl` | Use `onlyMainContent: true` to strip nav/ads |
| Research a topic | `search` | Returns top N results with content |
| Audit a website | `mapUrl` then `batchScrapeUrls` | Map first to find relevant URLs, then scrape |
| Extract structured data | `scrapeUrl` with `extract.schema` | Pass Zod schema for typed output |
| Monitor page changes | `scrapeUrl` with `changeTracking` | Detects new/changed/removed content |
| Process many URLs | `batchScrapeUrls` | Parallel, more efficient than loop |
| Fill form then scrape | `scrapeUrl` with `actions` | click, fill, wait, scroll before extract |
| Crawl docs site | `crawlUrl` | Set `maxDepth`, `includePaths`, `limit` |
| Build LLM context | `generateLLMsText` | Produces clean llms.txt from entire domain |

## Self-Hosted Setup (no API key needed)

The cloned repo is at `C:/Users/Techa/.paperclip/tmp_surfers/firecrawl`.

```sh
# Start self-hosted instance
cd C:/Users/Techa/.paperclip/tmp_surfers/firecrawl
docker-compose up -d
# API runs on http://localhost:3002
```

Then initialize without API key:
```ts
const app = new FirecrawlApp({ apiUrl: 'http://localhost:3002' });
```

## Environment Variables

```
FIRECRAWL_API_KEY=fc-your-key-here       # from firecrawl.dev (cloud)
FIRECRAWL_API_URL=http://localhost:3002  # self-hosted override
```

## Error Handling

```ts
const result = await app.scrapeUrl('https://example.com');
if (!result.success) {
  console.error('Firecrawl error:', result.error);
  // Common errors:
  // "Request failed with status code 429" = rate limited
  // "Request failed with status code 402" = credits exhausted
  // "Request timed out" = page too slow, increase timeout
}
```

## Limitations

- Cloud API requires credits (free tier available at firecrawl.dev)
- Self-hosted requires Docker + Redis + the API server
- `actions` (click/fill) only on cloud or playwright-enabled self-hosted
- `extract` with schema uses AI credits in addition to scrape credits
- `crawlUrl` is async — large sites may take minutes; use `crawlUrlAndWatch` for streaming

## Memory & State Pattern

Firecrawl is stateless. For agents that need to remember extracted data across tasks:

```ts
// Extract data and store in Paperclip issue
const page = await app.scrapeUrl(url, { formats: ['markdown'] });
await issuesApi.addComment(issueId, {
  body: `## Scraped: ${url}\n\n${page.markdown}`
});

// Next session: pull from issue comments and re-inject as context
const comments = await issuesApi.listComments(issueId);
const context = comments.map(c => c.body).join('\n\n---\n\n');
// Use context in next agent prompt
```

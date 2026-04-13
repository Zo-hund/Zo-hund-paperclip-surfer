# Firecrawl Skill

Firecrawl is a powerful web research and data extraction tool. It allows agents to scrape, crawl, search, and map websites with ease.

## Capabilities

- **Scraping**: Extract content from a single URL.
- **Crawling**: Recursively follow links on a website to extract content.
- **Searching**: Perform web searches and extract results.
- **Mapping**: Generate a map of a website's structure.

## Tools

### `firecrawl_scrape`
Scrapes a single URL and returns the content in a clean format.
- **Arguments**:
  - `url` (string, required): The URL to scrape.
  - `formats` (array of strings, optional): Formats to return (e.g., `["markdown", "html"]`).
  - `wait_for` (number, optional): Time to wait for the page to load in milliseconds.

### `firecrawl_crawl`
Starts a crawl of a website starting from a base URL.
- **Arguments**:
  - `url` (string, required): The base URL to start crawling from.
  - `limit` (number, optional): Maximum number of pages to crawl.
  - `allow_backward_links` (boolean, optional): Whether to allow crawling links that point to parent directories.

### `firecrawl_search`
Searches the web and returns results with extracted content.
- **Arguments**:
  - `query` (string, required): The search query.
  - `limit` (number, optional): Maximum number of results to return.

### `firecrawl_map`
Maps a website and returns a list of discovered URLs.
- **Arguments**:
  - `url` (string, required): The URL to map.

## Usage Instructions

Agents should use Firecrawl when they need to gather up-to-date information from the web or extract data from specific websites. 
Always prefer `scrape` for single pages and `crawl` for gathering information from across a domain. 
Use `map` to understand the structure of a site before deciding what to scrape or crawl.

# AMX Air Hubs (amx-air-hubs.cc) — Google Workspace Integration & Communication Refinement

This document explains how Google Workspace (Gmail, Google Calendar, and Google Drive) integrations operate within the AMX Air Hubs platform for both local development and cloud (VPS) environments, enabling paying tenants and clients to refine agentic communication safely and efficiently.

---

## 1. Google Workspace MCP Catalog

AMX Air Hubs integrates Google Workspace services via Model Context Protocol (MCP) servers, exposing highly specific tools to your agents:

- **Gmail MCP Server (`@modelcontextprotocol/server-gmail`)**:
  - Exposes tools to search messages, read threads, retrieve profiles, create drafts, and send emails.
  - Used for summarizing client updates, drafting responses, and automated inbox triaging.
- **Google Calendar MCP Server (`@modelcontextprotocol/server-gcal`)**:
  - Exposes tools to create events, update invites, list calendars, find meeting times, and inspect free/busy schedules.
  - Used for scheduling syncs, managing project deadlines, and coordinating team availability.
- **Google Drive Integration**:
  - Exposes tools to download, upload, and list files in shared Google Drive folders.
  - Used to fetch raw client inputs (Data Sources) and output deliverables automatically mapped to the OPPRRC folder structure.

---

## 2. Environment Execution & Authentication Models

Google APIs require secure OAuth 2.0 authentication. AMX Air Hubs handles this differently depending on your runtime environment:

### Local Development Mode (`local_trusted`)

1. **Desktop OAuth Flow**:
   - The Gmail and Calendar MCP servers run as local processes (`stdio` transport).
   - Upon first initialization, a browser window opens automatically on your machine to authenticate with Google.
   - The authenticated access and refresh tokens are cached locally in your home directory (e.g., `~/.credentials/`).
2. **Speed & Fast Startup**:
   - Low setup friction; ideal for single-operator testing and local development.

### Headless Cloud/VPS Mode (`authenticated + public`)

Because VPS environments are headless (no GUI to open a browser for OAuth approvals), AMX Air Hubs uses secure server-side credentials management:

1. **OAuth 2.0 Web Client Credentials via Secrets**:
   - Tenants generate a persistent **OAuth Refresh Token** using Google's OAuth 2.0 Playground or a local helper script.
   - The OAuth **Client ID**, **Client Secret**, and **Refresh Token** are saved securely under **Company Secrets** (encrypted at rest in the PostgreSQL database using the master encryption key).
   - On agent heartbeat execution, the runner injects these secrets dynamically as environment variables into the stdio MCP server command context.
2. **Google Cloud Service Accounts**:
   - For enterprise tenants, service accounts with **Domain-Wide Delegation (DWD)** can be utilized.
   - The service account JSON key file is mounted or bound to the agent environment, allowing it to impersonate users without requiring interactive browser authentication.

---

## 3. Communication Refinement & Controls

Agentic communication must be professional, reliable, and secure. AMX Air Hubs implements strict invariants to refine how agents interact with your clients:

### Q: Can agents send emails or calendar invites without approval?
- **Human-in-the-Loop Transparency**: By default, agents are restricted to **draft-only** actions (`gmail_create_draft` or `gcal_create_event` with a pending status). 
- **Approval Gates**: Mutating actions (such as sending a drafted email to a client or confirming a calendar invite) are designated as **governed actions** that require explicit operator approval on the Board.
- **Activity Logging**: Every Gmail/Calendar action taken by the agent is logged in the Activity Log for audit trail tracking.

### Q: How do agents refine emails for client delivery?
- **System Instructions**: System prompts guide agents to use clear, professional language, matching the company brand voice.
- **Context Snapshotting**: Agents query the project memory before drafting updates, ensuring they do not write emails missing crucial historical context.
- **Auto-Formatting**: Emails are formatted with rich HTML or clean plain-text options, featuring structured outlines and direct links to the relevant deliverables.

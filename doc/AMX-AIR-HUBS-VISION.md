# AMX-AIR-HUBS v1.0 — Engineering Vision & Governing Roadmap

> **Status:** Governing reference for AMX-AIR-HUBS design decisions. This document
> records the long-range product vision. It is **not** a literal description of the
> current stack — the live platform is the Paperclip control plane (Express 5 +
> Drizzle ORM + React 19 / Vite), extended additively. Where the vision names a
> different stack (Next.js/FastAPI/Prisma/Supabase), treat it as aspirational unless
> a phase explicitly migrates that layer.
>
> The implementation approach (which existing primitives back each phase, and the
> phased build order) lives in the approved plan and in
> `doc/SPEC-implementation.md`. This file is the **what/why**; the plan is the **how**.

## Mission

Build AMX-AIR-HUBS as a Human-Centric AI Operating System (HC-AIOS) capable of
orchestrating local AI, cloud AI, infrastructure, autonomous agents, and human
governance through the **SIM → PIT STOP → LIVE** execution lifecycle.

## Governing operating principle

Every task executed inside AMX-AIR-HUBS must follow:

`SIM → PIT STOP → LIVE → OPPRRC → REPORTS → CERTIFICATE → LEARNING LOOP`

without exception. This lifecycle is enforced by **system design**, not user
discipline.

---

## Phase 1 — Foundation

**Frontend:** Next.js 16, React 19, TypeScript, TailwindCSS, ShadCN UI, Framer Motion
**Backend:** FastAPI, Node.js services, PostgreSQL, Redis, Supabase Auth, Prisma ORM
**Infrastructure:** Docker, Kubernetes, Hostinger VPS, Cloudflare Tunnel, Traefik, Nginx, GitHub Actions
**Storage:** S3-compatible storage, local NAS, Cloudflare R2

## Phase 2 — Core Dashboard

Modules: Dashboard, Race Grid, Sim Runs, Pit Stops, Live Runs, Organizations, Programs,
Projects, Resources, Reports, Certificates, Models, Agents, Infrastructure, Settings.

Each module supports: Create, Read, Update, Delete, Search, Filter, Audit History,
Role Permissions.

## Phase 3 — AI Router

Dynamic provider routing across **Local / Cloud / Enterprise** providers.
Decision variables: Privacy, Latency, Token Cost, Context Window, GPU Availability,
Reliability. Routing automatically chooses the lowest-cost acceptable model while
respecting governance policies.

## Phase 4 — Agent Fleet

Agents: **TAZ** (Program Manager), **JAZ** (Education), **RAZ** (Business),
**NAZ** (Entertainment), **GAZ** (Governance), **OPS** (Infrastructure).
Each agent owns: Prompt Library, Memory, Tools, Knowledge Base, Task Queue,
Approval Rules, Cost Tracking, Execution History.

## Phase 5 — SIM RUN

Every task enters simulation first. Generates: Execution Graph, Estimated Runtime,
Estimated Cost, Risk Score, Required Permissions, Models Used, APIs Used, Rollback Plan.
**No external mutation allowed. Containerized sandbox only.**

## Phase 6 — PIT STOP

Human Review Center. Actions: Approve, Reject, Edit, Retry, Escalate, Audit.
Displays: Cost, Risk, Prompt, Output, Resources, Security Flags, Compliance Score.

## Phase 7 — LIVE RUN

Production execution. Features: Streaming Logs, Rollback, Pause, Resume, Kill Process,
Retry, Deploy, Archive. Every execution receives immutable identifiers.

## Phase 8 — OPPRRC

Organization, Programs, Projects, Resources, Reports, Certificates. Everything generated
by the system must belong to an OPPRRC record. **No orphan resources allowed.**

## Phase 9 — Reports

Runtime, GPU, Cost, Model Usage, Agent Usage, Program Analytics, Project Analytics,
Provider Analytics, Compliance, Executive Dashboards. Export: PDF, CSV, JSON, Markdown.

## Phase 10 — Certificates

Proof of Work, SHA256, AI Signature, Human Signature, Timestamp, Version, Model Used,
Reviewer, Hash Chain, Optional Blockchain Anchor, QR Code Verification.

## Phase 11 — SEL Learning Loop

Observe → Reflect → Improve → Coach → Reward → Repeat. Learning metrics feed future
routing decisions.

---

## Security

Zero Trust, RBAC, SSO, MFA, API Keys Vault, Secrets Manager, Audit Logs,
Encryption at Rest, Encryption in Transit, Signed Agent Calls, Node Authentication,
Rate Limiting, Cloudflare Protection.

## API Layer

REST, GraphQL, WebSocket, MCP, Webhook Support, OpenAPI Documentation.

## Future Expansion

XR Operations Center, 3D Data Center Visualization, Virtual Command Bridge,
Digital Twin Infrastructure, Edge AI Hub Management, Drone Fleet Control,
Robot Fleet Management, Community AI Cloud, Education Marketplace, Workforce Marketplace,
Grant Marketplace, AI Marketplace, AMX Rewards Marketplace.

---

## Mapping to the current platform (as of this handoff)

The current codebase already scaffolds much of the lifecycle; the build wires these
together rather than starting from scratch:

| Vision phase | Existing primitive | Location |
|---|---|---|
| SIM / LIVE mode | `heartbeat_runs.run_mode` (`sim`/`live`) + `promoted_from_run_id` | `packages/db/src/schema/heartbeat_runs.ts` |
| Sandbox | `cloud_sandbox` / `isolated_workspace` execution-workspace modes | `server/src/services/execution-workspace-policy.ts` |
| PIT STOP | `approvals` + `issue_approvals` | `server/src/services/approvals.ts` |
| LIVE controls | `live-events.ts` + `run-log-store.ts` | `server/src/services/` |
| OPPRRC | `amx_certificates.{projects,resources,reports}` | `packages/db/src/schema/amx_chain.ts` |
| Certificate | `amxChainService.issueCertificate()` / `verifyCertificate()` | `server/src/services/amxChainService.ts` |
| Lifecycle vocab | `rq_factory.lifecycle_stage` + `simulation_status` | `packages/db/src/schema/rq_factory.ts` |
| Lifecycle (issues) | `issues.lifecycle_stage` (`sim → … → learning`) | `packages/db/src/schema/issues.ts` |

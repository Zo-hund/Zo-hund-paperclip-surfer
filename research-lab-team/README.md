# AMX Research Lab

Cutting-edge research laboratory orchestrating local and global deployments across device boundaries.

## Overview

The AMX Research Lab is an autonomous agent-driven team designed to validate cross-device recognition and run local or global deployments. It demonstrates dynamic workflow routing, device fingerprinting, and remote SSH orchestration using the Hermes Local and Hermes Advanced Nous agents.

## Org Chart

- **Director** (Director) - central manager
  - **Hermes Sentinel** (Security and Local Deployments) - running via `hermes_local`
  - **Nous Specialist** (Advanced Tool Operations) - running via `hermes_advanced`

## Workflow (Hub-and-Spoke)

1. **Goal Assignment**: The Director assigns verification, deployment, or diagnostic tasks.
2. **Specialist Selection**:
   - Local diagnostics, host fingerprinting, and local container checks are routed to **Hermes Sentinel** (running locally).
   - Multi-step reasoning, remote VPS shell operations, and MCP submissions are routed to **Nous Specialist** (running Hermes Advanced).
3. **Done Criteria**: Specialists execute tasks, perform checks, generate verification logs, and report success back to the Director.

## Getting Started

To import this company package into your Paperclip board:

```bash
paperclipai company import --from ./research-lab-team
```

## References

- Built using the [Agent Companies Specification](https://agentcompanies.io/specification).
- Powered by [Paperclip](https://github.com/paperclipai/paperclip).

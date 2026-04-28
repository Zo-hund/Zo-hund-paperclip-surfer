# Work Order Pipeline

The **Work Order Pipeline** is a 4-stage orchestration system for routing autonomous agent work through Paperclip. It automates the entire lifecycle: intake, evaluation, assignment, and delivery verification.

## What It Does

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   STAGE 1    │      │   STAGE 2    │      │   STAGE 3    │      │   STAGE 4    │
│   INTAKE     │─────▶│    EVAL      │─────▶│  AGENTIC     │─────▶│   OUTPUT     │
│              │      │              │      │              │      │              │
│ Validate &   │      │ Score work   │      │ Create &     │      │ Verify &     │
│ intake WO    │      │ order against│      │ assign       │      │ complete     │
│ JSON from    │      │ weighted     │      │ Paperclip    │      │ deliverables │
│ Google Drive │      │ criteria     │      │ issues       │      │              │
└──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
      INBOX              QUEUED                RUNNING               COMPLETE
      ↓                  ↓                     ↓                     ↓
   Validate          Score & SIM           Assign to         Write RTC &
   JSON syntax       Create Paperclip      Agents           Move to folder
   Move to QUEUED    issues (test mode)                     
```

## Key Concepts

| Concept | Meaning |
|---------|---------|
| **Work Order (WO)** | A JSON file describing a task to be completed (title, description, deadline, routing) |
| **SIM vs. LIVE** | **SIM** = test/simulation mode with scoring but no external delivery; **LIVE** = real agent execution and delivery |
| **OPPRRC** | Output routing matrix that maps work types → destination folders (e.g., "revenue report" → `05_REPORTS/BOARD-INTERNAL/`) |
| **Run Time Card (RTC)** | JSON record of agent execution (duration, cost, tokens, deliverable path, eval score) |
| **Paperclip Issue** | Task assigned to an agent in Paperclip with context, description, and status tracking |
| **HITL Gate** | Human-in-the-loop approval checkpoint (e.g., for sensitive external deliverables) |

## The 4 Stages

### Stage 1: Intake
- Scans Google Drive `INBOX` folder for new work order JSON files
- Validates JSON schema (required fields, types, project IDs)
- Moves valid WOs to `QUEUED` folder
- Rejects invalid WOs with error details

### Stage 2: Evaluation
- Scores each queued work order against weighted success criteria
- Creates test Paperclip issues in **SIM mode** (doesn't execute agent work)
- Produces eval JSON with score, passed/failed criteria
- Determines if WO qualifies for promotion to LIVE

### Stage 3: Agentic
- Converts high-scoring SIM work orders to **LIVE** Paperclip issues
- Looks up preferred agents and assigns work
- Embeds full work order context in issue description
- Tracks Paperclip issue ID ↔ work order mapping

### Stage 4: Output
- Writes **Run Time Cards** (execution metadata after agent completion)
- Verifies deliverables exist in correct output paths
- Writes chain receipts for auditing
- Moves completed work orders to `COMPLETE` folder

## Quick Facts

| Fact | Value |
|------|-------|
| **Base Path** | `G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AIR-HUB-FOLDER-OPPRRC\AMX-LABS` |
| **Pipeline Script** | `scripts/wo-pipeline.mjs` (Node.js) |
| **Paperclip API** | `http://localhost:3100` (default) |
| **Work Order Folder** | `00_HUB_CONFIG/WORK_ORDERS/` |
| **CLI Command** | `node scripts/wo-pipeline.mjs [intake\|eval\|agentic\|output\|promote\|status]` |
| **Expected Duration** | ~5 min per stage (depends on agent response time) |

## Common Workflows

### Submit a Work Order
1. Create a JSON file with WO details (see [QUICK-START](docs/QUICK-START-WORK-ORDERS.md))
2. Save to `WORK_ORDERS/INTERNAL/INBOX/` (internal) or `EXTERNAL/INBOX/` (external)
3. Run `node scripts/wo-pipeline.mjs intake`
4. Check `QUEUED/` folder for next stage

### Run the Full Pipeline
```bash
# Stage 1: Intake (validate, move to QUEUED)
node scripts/wo-pipeline.mjs intake

# Stage 2: Eval (score, create SIM issues)
node scripts/wo-pipeline.mjs eval

# Stage 3: Agentic (assign LIVE issues, agents work)
node scripts/wo-pipeline.mjs agentic

# Stage 4: Output (verify, complete)
node scripts/wo-pipeline.mjs output

# Promote SIM to LIVE (if auto-promote criteria met)
node scripts/wo-pipeline.mjs promote
```

### Check Pipeline Status
```bash
node scripts/wo-pipeline.mjs status
```

Shows counts of WOs at each stage (INBOX, QUEUED, RUNNING, COMPLETE, FAILED).

## Documentation

- **[QUICK-START](docs/QUICK-START-WORK-ORDERS.md)** — How to create and submit a work order (5 min read)
- **[OPERATOR-GUIDE](docs/OPERATOR-GUIDE.md)** — How to run the pipeline, troubleshoot, and monitor (30 min read)
- **[ARCHITECTURE](docs/ARCHITECTURE.md)** — How each stage works, data flow, design decisions (45 min read)
- **[SCHEMAS-AND-FORMATS](docs/SCHEMAS-AND-FORMATS.md)** — Work order JSON schema, run time cards, formats (reference)
- **[API-REFERENCE](docs/API-REFERENCE.md)** — Paperclip API endpoints used by the pipeline (reference)
- **[TROUBLESHOOTING](docs/TROUBLESHOOTING.md)** — Debugging failed work orders, error solutions (reference)
- **[CONFIGURATION](docs/CONFIGURATION.md)** — Environment setup, config files, customization (reference)

## Who Uses This?

- **Work Order Submitters** — Submit tasks via JSON, track status → start with [QUICK-START](docs/QUICK-START-WORK-ORDERS.md)
- **Pipeline Operators** — Run stages, monitor, troubleshoot → start with [OPERATOR-GUIDE](docs/OPERATOR-GUIDE.md)
- **Developers** — Extend the system, add stages → start with [ARCHITECTURE](docs/ARCHITECTURE.md)

## Next Steps

→ **New user?** See [QUICK-START](docs/QUICK-START-WORK-ORDERS.md)  
→ **Operating the pipeline?** See [OPERATOR-GUIDE](docs/OPERATOR-GUIDE.md)  
→ **Extending the system?** See [ARCHITECTURE](docs/ARCHITECTURE.md)

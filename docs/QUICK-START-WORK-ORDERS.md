# Quick Start: Submitting Work Orders

This guide walks you through submitting a work order and tracking its progress through the pipeline.

**Time estimate:** 10 minutes to submit your first work order.

## Folder Structure

Your work orders live in Google Drive. Here's where files go at each stage:

```
G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AIR-HUB-FOLDER-OPPRRC\AMX-LABS\
├── 00_HUB_CONFIG\
│   └── WORK_ORDERS\
│       ├── INTERNAL\
│       │   ├── INBOX\          ← Submit internal WOs here (Step 1)
│       │   ├── QUEUED\         ← After intake validation (Step 2)
│       │   └── ...
│       └── EXTERNAL\
│           ├── INBOX\          ← Submit external WOs here
│           └── ...
├── PROCESSING\
│   ├── QUEUED\                 ← Waiting for evaluation
│   ├── RUNNING\                ← Being worked on by an agent
│   ├── COMPLETE\               ← Done
│   └── FAILED\                 ← Error occurred
└── ...
```

## Step 1: Create a Work Order JSON File

Create a new text file with the work order details. Here's a minimal example:

**File name:** `WO-2026-001.json`

```json
{
  "wo_id": "WO-2026-001",
  "request_type": "internal",
  "stage": "sim",
  "work_order": {
    "title": "Weekly Revenue Report",
    "description": "Generate the weekly revenue summary for board review",
    "deliverable_type": "report",
    "priority": "high",
    "deadline_iso": "2026-04-28T17:00:00Z"
  },
  "requestor": {
    "agent_or_user": "CEO",
    "partner_name": "Internal Finance Team"
  },
  "routing": {
    "project_id": "d1234567-1234-5678-9abc-def012345678",
    "preferred_agents": ["CEO", "CFO"],
    "hitl_required_before_delivery": false
  },
  "opprrc_output": {
    "audience": "BOARD-INTERNAL",
    "filename_pattern": "WO-{wo_id}-REVENUE-WEEKLY-{date}",
    "path": "05_REPORTS/BOARD-INTERNAL/"
  },
  "eval": {
    "scoring_weights": "default",
    "success_criteria_ids": ["completeness", "accuracy", "timeliness"],
    "min_score_to_promote": 0.75,
    "requires_manual_promotion": false
  }
}
```

### Field Explanations

| Field | Type | Required? | Example | Notes |
|-------|------|-----------|---------|-------|
| `wo_id` | string | Yes | `WO-2026-001` | Unique identifier. Use format `WO-YYYY-NNN` |
| `request_type` | string | Yes | `internal` | Either `internal` or `external` |
| `stage` | string | Yes | `sim` | Start with `sim` (test). Use `live` after approval |
| `work_order.title` | string | Yes | `Weekly Revenue Report` | Short, descriptive title |
| `work_order.description` | string | Yes | `Generate revenue summary...` | Detailed instructions for the agent |
| `work_order.deliverable_type` | string | Yes | `report` | E.g., `report`, `code`, `data`, `analysis`, `proposal` |
| `work_order.priority` | string | Yes | `high` | One of: `critical`, `high`, `medium`, `low` |
| `work_order.deadline_iso` | string | Yes | `2026-04-28T17:00:00Z` | ISO 8601 timestamp (UTC) |
| `requestor.agent_or_user` | string | Yes | `CEO` | Who is requesting this work |
| `requestor.partner_name` | string | Yes | `Internal Finance Team` | Partner or department |
| `routing.project_id` | string | Yes | `d1234567-...` | Paperclip project ID (see below) |
| `routing.preferred_agents` | array | Yes | `["CEO", "CFO"]` | List of preferred agent names (will be assigned in order) |
| `routing.hitl_required_before_delivery` | boolean | No | `false` | If `true`, requires manual approval before external delivery |
| `opprrc_output.audience` | string | Yes | `BOARD-INTERNAL` | Target audience (routing destination) |
| `opprrc_output.filename_pattern` | string | Yes | `WO-{wo_id}-...` | Template for output filename. Supports `{wo_id}`, `{date}`, `{slug}` |
| `opprrc_output.path` | string | Yes | `05_REPORTS/BOARD-INTERNAL/` | Where to save the deliverable |
| `eval.scoring_weights` | string | Yes | `default` | Evaluation profile name |
| `eval.success_criteria_ids` | array | Yes | `["completeness", ...]` | Which success criteria to check |
| `eval.min_score_to_promote` | number | Yes | `0.75` | Minimum score (0.0-1.0) to promote from SIM to LIVE |
| `eval.requires_manual_promotion` | boolean | No | `false` | If `true`, requires manual approval to go LIVE |

## Step 2: Find Your Project ID

You need a Paperclip project ID. There are two ways:

### Option A: Get It from Paperclip
1. Open Paperclip UI (usually `http://localhost:3100`)
2. Navigate to **Projects**
3. Find your project and click it
4. Copy the project ID from the URL or project details
5. Paste it in `routing.project_id`

### Option B: Use a Known Project
Common project IDs (ask your team):
- `d1234567-1234-5678-9abc-def012345678` — Default/Test project
- Ask your Paperclip admin for the project ID

## Step 3: Save the File

Save your JSON file to the correct folder:

- **Internal work order:** `WORK_ORDERS/INTERNAL/INBOX/WO-2026-001.json`
- **External work order:** `WORK_ORDERS/EXTERNAL/INBOX/WO-2026-001.json`

## Step 4: Run Intake

Tell the pipeline to process your new work order:

```bash
cd /path/to/tmp_surfers
node scripts/wo-pipeline.mjs intake
```

This will:
1. Scan the `INBOX` folder
2. Validate your JSON
3. Move valid WOs to `QUEUED`
4. Report any errors

**Example output:**
```
✓ Intake complete
  - Processed: WO-2026-001
  - Valid: 1
  - Failed: 0
  - Moved to QUEUED: 1
```

### Troubleshooting Intake Errors

| Error | Solution |
|-------|----------|
| `Invalid JSON` | Check syntax in your JSON file (extra comma, missing quote?) |
| `Missing required field: X` | Add the missing field from the table above |
| `Invalid project_id` | Verify the project ID exists in Paperclip |
| `Invalid deadline_iso` | Use ISO 8601 format: `2026-04-28T17:00:00Z` |

## Step 5: Monitor Progress

### Check the Status Dashboard

```bash
node scripts/wo-pipeline.mjs status
```

**Example output:**
```
Pipeline Status
├── INBOX: 0 WOs
├── QUEUED: 1 WOs
│   └── WO-2026-001
├── RUNNING: 0 WOs
├── COMPLETE: 0 WOs
└── FAILED: 0 WOs
```

### Manually Check Folders

1. Open Google Drive and navigate to `AMX-LABS/00_HUB_CONFIG/WORK_ORDERS/`
2. Check which folder your WO is in:
   - **QUEUED** = Waiting for evaluation
   - **RUNNING** = Being worked on
   - **COMPLETE** = Done ✓
   - **FAILED** = Error occurred

## Step 6: Wait for Evaluation

The operator will run the evaluation stage:

```bash
node scripts/wo-pipeline.mjs eval
```

This:
1. Scores your WO against success criteria
2. Creates a test Paperclip issue (SIM mode)
3. Generates an eval JSON with scores

**Check for:** `EVALS/RESULTS/WO-2026-001-eval.json` in Google Drive

## Step 7: Agent Execution (LIVE)

If the eval score is high enough, your WO is promoted to LIVE:

```bash
node scripts/wo-pipeline.mjs promote
```

Then:

```bash
node scripts/wo-pipeline.mjs agentic
```

This creates a real Paperclip issue and assigns it to your preferred agents. Agents will work on it.

## Step 8: Deliverable Delivered

When the agent finishes, the operator runs:

```bash
node scripts/wo-pipeline.mjs output
```

This:
1. Verifies the deliverable exists
2. Writes a run time card
3. Moves your WO to `COMPLETE`

**Find your deliverable at:** The path specified in `opprrc_output.path` (e.g., `05_REPORTS/BOARD-INTERNAL/`)

## Common Scenarios

### Scenario A: Quick Internal Report (SIM)
You want to test a new report format without involving the full pipeline.

**JSON template:**
```json
{
  "wo_id": "WO-2026-TEST-001",
  "request_type": "internal",
  "stage": "sim",
  "work_order": {
    "title": "Test Report Format",
    "description": "Test a new report format for board reviews",
    "deliverable_type": "report",
    "priority": "low",
    "deadline_iso": "2026-04-28T18:00:00Z"
  },
  "routing": {
    "project_id": "YOUR_PROJECT_ID",
    "preferred_agents": ["CEO"],
    "hitl_required_before_delivery": false
  },
  "opprrc_output": {
    "audience": "BOARD-INTERNAL",
    "filename_pattern": "TEST-{wo_id}-{date}",
    "path": "05_REPORTS/TEST/"
  },
  "eval": {
    "scoring_weights": "default",
    "success_criteria_ids": ["completeness"],
    "min_score_to_promote": 0.5,
    "requires_manual_promotion": false
  }
}
```

### Scenario B: External Client Deliverable (LIVE with HITL)
You want to deliver a report to a client but require manual approval first.

**JSON template:**
```json
{
  "wo_id": "WO-2026-CLIENT-001",
  "request_type": "external",
  "stage": "live",
  "work_order": {
    "title": "Q2 Performance Report for Acme Corp",
    "description": "Generate Q2 performance metrics and insights for Acme Corp",
    "deliverable_type": "report",
    "priority": "high",
    "deadline_iso": "2026-05-15T17:00:00Z"
  },
  "routing": {
    "project_id": "YOUR_PROJECT_ID",
    "preferred_agents": ["CMO", "CEO"],
    "hitl_required_before_delivery": true
  },
  "opprrc_output": {
    "audience": "CLIENTS-EXTERNAL",
    "filename_pattern": "{wo_id}-ACME-Q2-REPORT-{date}",
    "path": "05_REPORTS/CLIENTS-EXTERNAL/"
  },
  "eval": {
    "scoring_weights": "strict",
    "success_criteria_ids": ["completeness", "accuracy", "timeliness"],
    "min_score_to_promote": 0.85,
    "requires_manual_promotion": true
  }
}
```

## Next Steps

- **Having issues?** See [OPERATOR-GUIDE](OPERATOR-GUIDE.md#troubleshooting)
- **Want to understand how it works?** See [ARCHITECTURE](ARCHITECTURE.md)
- **Need API details?** See [API-REFERENCE](API-REFERENCE.md)

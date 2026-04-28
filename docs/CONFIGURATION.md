# Configuration Guide

Set up the work order pipeline environment and customize configuration files.

## Environment Variables

Create a `.env` file in the root of the pipeline directory (`/tmp_surfers/.env`).

### Required Variables

```bash
# Paperclip API
PAPERCLIP_API_URL=http://localhost:3100
PAPERCLIP_BOARD_TOKEN=pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc

# Company ID (for creating issues)
AMX_COMPANY_ID=dece557d-8849-4040-b8ad-e0e235a54b52

# Google Drive
GOOGLE_DRIVE_BASE_PATH=G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AIR-HUB-FOLDER-OPPRRC\AMX-LABS
```

### Optional Variables

```bash
# Logging
DEBUG=wo-pipeline:*
LOG_LEVEL=debug

# Timeouts
PAPERCLIP_API_TIMEOUT=10000  # milliseconds
GOOGLE_DRIVE_TIMEOUT=10000

# Batch Processing
MAX_INTAKE_PER_RUN=100
MAX_EVAL_PER_RUN=50
MAX_AGENTIC_PER_RUN=20
```

### Example `.env` File

```bash
# .env
PAPERCLIP_API_URL=http://localhost:3100
PAPERCLIP_BOARD_TOKEN=pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc
AMX_COMPANY_ID=dece557d-8849-4040-b8ad-e0e235a54b52
GOOGLE_DRIVE_BASE_PATH=G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AIR-HUB-FOLDER-OPPRRC\AMX-LABS

# Optional
DEBUG=wo-pipeline:*
LOG_LEVEL=debug
```

---

## Configuration Files

These files control how the pipeline evaluates and routes work orders.

### 1. Success Criteria Registry

**File:** `EVALS/SCORING/SUCCESS_CRITERIA.json`

Defines the criteria used to evaluate work orders.

#### Default Structure

```json
{
  "completeness": "Does the deliverable cover all requested sections?",
  "accuracy": "Are the facts, numbers, and conclusions correct?",
  "timeliness": "Was the work delivered by the deadline?",
  "formatting": "Is the output in the requested format?",
  "external_compliance": "Does it meet external standards?",
  "readability": "Is the output clear and well-organized?"
}
```

#### Customization

Add or remove criteria as needed:

```json
{
  "completeness": "...",
  "accuracy": "...",
  "timeliness": "...",
  "code_quality": "Is the code well-structured and documented?",
  "test_coverage": "Are there sufficient unit tests?"
}
```

Then use in work orders:

```json
{
  "eval": {
    "success_criteria_ids": ["completeness", "code_quality", "test_coverage"]
  }
}
```

---

### 2. Scoring Weights

**File:** `EVALS/SCORING/SCORING_WEIGHTS.json`

Defines how different criteria are weighted in the final score.

#### Default Structure

```json
{
  "default": {
    "completeness": 0.4,
    "accuracy": 0.4,
    "timeliness": 0.2
  },
  "external_strict": {
    "completeness": 0.3,
    "accuracy": 0.5,
    "timeliness": 0.2
  },
  "internal_fast": {
    "completeness": 0.6,
    "accuracy": 0.3,
    "timeliness": 0.1
  }
}
```

#### Customization

Add new profiles:

```json
{
  "default": { ... },
  "external_strict": { ... },
  "internal_fast": { ... },
  "research_heavy": {
    "completeness": 0.3,
    "accuracy": 0.6,
    "timeliness": 0.1
  }
}
```

Weights must sum to 1.0 (approximately). If they don't, the score is normalized automatically.

#### How Scoring Works

With weights `{"completeness": 0.4, "accuracy": 0.4, "timeliness": 0.2}`:

```
Score = (completeness * 0.4) + (accuracy * 0.4) + (timeliness * 0.2)
       = (1.0 * 0.4) + (1.0 * 0.4) + (0.0 * 0.2)
       = 0.4 + 0.4 + 0.0
       = 0.8
```

Only criteria listed in `eval.success_criteria_ids` are evaluated.

---

### 3. OPPRRC Output Map

**File:** `OPPRRC_OUTPUT_MAP.json`

Maps work order audiences to output folder paths.

#### Default Structure

```json
{
  "BOARD-INTERNAL": "05_REPORTS/BOARD-INTERNAL/",
  "CLIENTS-EXTERNAL": "05_REPORTS/CLIENTS-EXTERNAL/",
  "OPERATIONS": "04_OPERATIONS/INTERNAL/",
  "FINANCE": "05_REPORTS/FINANCE/",
  "MARKETING": "03_MARKETING/CAMPAIGNS/",
  "ENGINEERING": "02_ENGINEERING/DELIVERABLES/"
}
```

#### Customization

Add new audiences:

```json
{
  "BOARD-INTERNAL": "05_REPORTS/BOARD-INTERNAL/",
  "CLIENTS-EXTERNAL": "05_REPORTS/CLIENTS-EXTERNAL/",
  "SALES": "03_SALES/PROPOSALS/",
  "HR": "06_INTERNAL/HR/",
  "LEGAL": "07_LEGAL/CONTRACTS/"
}
```

Then use in work orders:

```json
{
  "opprrc_output": {
    "audience": "SALES",
    "path": "03_SALES/PROPOSALS/"
  }
}
```

---

## Folder Structure

The pipeline expects this folder structure on Google Drive:

```
AMX-LABS/
├── 00_HUB_CONFIG/
│   └── WORK_ORDERS/
│       ├── INTERNAL/
│       │   ├── INBOX/                  (new WOs created here)
│       │   ├── QUEUED/                 (after intake validation)
│       │   ├── PROCESSING/
│       │   │   ├── QUEUED/
│       │   │   ├── RUNNING/            (awaiting agent or output)
│       │   │   ├── COMPLETE/           (finished)
│       │   │   └── FAILED/             (errors)
│       │   └── ARCHIVE/                (old completed WOs)
│       └── EXTERNAL/
│           ├── INBOX/
│           ├── QUEUED/
│           └── PROCESSING/
│               ├── QUEUED/
│               ├── RUNNING/
│               ├── COMPLETE/
│               └── FAILED/
├── EVALS/
│   ├── SCORING/
│   │   ├── SUCCESS_CRITERIA.json       (criteria registry)
│   │   └── SCORING_WEIGHTS.json        (weighting profiles)
│   ├── RESULTS/                        (eval outputs)
│   └── TEST_DATASETS/
│       ├── SIM/                        (test WOs)
│       └── LIVE/
├── PROCESSING/
│   ├── QUEUED/
│   ├── RUNNING/
│   ├── COMPLETE/
│   └── FAILED/
├── WORK-ORDER-CHAIN/                   (audit trail)
├── OPPRRC_OUTPUT_MAP.json              (routing config)
│
├── 02_ENGINEERING/
├── 03_MARKETING/
├── 04_OPERATIONS/
├── 05_REPORTS/
│   ├── BOARD-INTERNAL/                 (deliverables go here)
│   └── CLIENTS-EXTERNAL/
├── 06_INTERNAL/
├── 07_LEGAL/
└── ...
```

**Important:** The pipeline needs folders to exist before writing files. Create them manually on Google Drive if missing.

---

## Paperclip Configuration

### Get Paperclip Token

1. Open Paperclip UI (`http://localhost:3100`)
2. Go to **Settings** → **API**
3. Click **Generate Token**
4. Copy the token (starts with `pcp_board_`)
5. Add to `.env` as `PAPERCLIP_BOARD_TOKEN`

### Get Company ID

1. In Paperclip, go to **Settings** → **Company**
2. Find your company UUID
3. Add to `.env` as `AMX_COMPANY_ID`

### Project IDs

Get your project UUIDs from Paperclip:

1. Go to **Projects**
2. Click on your project
3. Copy UUID from URL or project details
4. Use in work orders' `routing.project_id`

**Common project IDs:**
- `d1234567-1234-5678-9abc-def012345678` — Default test project
- Ask your Paperclip admin for production project IDs

---

## Agent Assignment

### Agent Names

Agent names must match exactly as they appear in Paperclip.

**To find agent names:**

```bash
curl "http://localhost:3100/api/companies/{AMX_COMPANY_ID}/agents" \
  -H "Authorization: Bearer {PAPERCLIP_BOARD_TOKEN}" \
  | jq '.agents[].name'
```

Output:
```
CEO
CFO
CMO
CTO
Operations Lead
```

### Preferred Agents

In work orders, list agents in preferred order:

```json
{
  "routing": {
    "preferred_agents": ["CEO", "CFO", "CTO"]
  }
}
```

The pipeline tries to assign to the first available agent.

### Budget Management

Agents have monthly budgets. If budget is exhausted, agent is paused.

**Check agent budget:**

```bash
curl "http://localhost:3100/api/companies/{cid}/agents" \
  -H "Authorization: Bearer {token}" \
  | jq '.agents[] | {name, status, spentMonthlyCents, budgetMonthlyCents}'
```

**Increase budget:** Contact Paperclip admin or increase in Paperclip UI.

---

## Customization Examples

### Example 1: Add Custom Evaluation Criteria

**Scenario:** You want to evaluate code for "test coverage"

1. Edit `EVALS/SCORING/SUCCESS_CRITERIA.json`:
   ```json
   {
     "completeness": "...",
     "accuracy": "...",
     "test_coverage": "Are there sufficient unit tests (>80%)?"
   }
   ```

2. Create new scoring profile in `EVALS/SCORING/SCORING_WEIGHTS.json`:
   ```json
   {
     "code_strict": {
       "completeness": 0.3,
       "accuracy": 0.4,
       "test_coverage": 0.3
     }
   }
   ```

3. Use in work order:
   ```json
   {
     "eval": {
       "scoring_weights": "code_strict",
       "success_criteria_ids": ["completeness", "accuracy", "test_coverage"]
     }
   }
   ```

---

### Example 2: Add New Output Audience

**Scenario:** You want to deliver reports to the Sales team

1. Edit `OPPRRC_OUTPUT_MAP.json`:
   ```json
   {
     "SALES": "03_SALES/REPORTS/"
   }
   ```

2. Create the folder on Google Drive: `AMX-LABS/03_SALES/REPORTS/`

3. Use in work order:
   ```json
   {
     "opprrc_output": {
       "audience": "SALES",
       "filename_pattern": "SALES-REPORT-{date}",
       "path": "03_SALES/REPORTS/"
     }
   }
   ```

---

### Example 3: Adjust Evaluation Threshold

**Scenario:** You want to make promotion easier (lower threshold)

Edit work order:
```json
{
  "eval": {
    "min_score_to_promote": 0.70  // Was 0.75, now 0.70 (easier)
  }
}
```

Or globally adjust scoring weights to be more lenient:
```json
{
  "internal_lenient": {
    "completeness": 0.5,
    "accuracy": 0.3,
    "timeliness": 0.2
  }
}
```

Then use in work orders:
```json
{
  "eval": {
    "scoring_weights": "internal_lenient"
  }
}
```

---

## Troubleshooting Configuration

### Problem: "Agent not found"

**Check:** Do agent names in work orders match Paperclip exactly?

```bash
# Get actual agent names from Paperclip
curl "http://localhost:3100/api/companies/{cid}/agents?limit=100" \
  -H "Authorization: Bearer {token}" \
  | jq '.agents[].name'
```

Compare with `routing.preferred_agents` in your WO. Names must match exactly (case-sensitive).

---

### Problem: "Deliverable goes to wrong folder"

**Check:** Is the audience in `opprrc_output.audience` defined in `OPPRRC_OUTPUT_MAP.json`?

```bash
# View the map
cat OPPRRC_OUTPUT_MAP.json
```

If audience is missing, add it to the map and the WO.

---

### Problem: "Evaluation score is always the same"

**Check:** Are you using the right scoring weights profile?

```json
{
  "eval": {
    "scoring_weights": "default"  // Are all criteria failing? Try different profile
  }
}
```

Try a more lenient profile to see if scores change:

```json
{
  "eval": {
    "scoring_weights": "internal_fast"  // More weight on completeness
  }
}
```

If still no change, check if criteria are actually evaluated in `SUCCESS_CRITERIA.json`.

---

## Best Practices

1. **Version control:** Commit configuration changes to git
   ```bash
   git add EVALS/SCORING/*.json OPPRRC_OUTPUT_MAP.json
   git commit -m "Add new evaluation criteria and output audience"
   ```

2. **Test changes:** Create a test WO in SIM mode first
   ```json
   {
     "stage": "sim",
     "eval": {
       "scoring_weights": "my_new_profile"
     }
   }
   ```

3. **Document changes:** Add comments to JSON files
   ```json
   {
     "test_coverage": "Added 2026-04-27 for code evaluations",
     "completeness": "..."
   }
   ```

4. **Backup configs:** Keep copies before major changes
   ```bash
   cp EVALS/SCORING/SUCCESS_CRITERIA.json SUCCESS_CRITERIA.json.backup
   ```

5. **Monitor impact:** Check eval scores after config changes
   ```bash
   # Compare scores before/after
   grep '"score"' EVALS/RESULTS/*.json | sort -t: -k2 -n
   ```

---

## Next Steps

- **Need to set up from scratch?** See [QUICK-START](QUICK-START-WORK-ORDERS.md)
- **Running the pipeline?** See [OPERATOR-GUIDE](OPERATOR-GUIDE.md)
- **Understanding how it works?** See [ARCHITECTURE](ARCHITECTURE.md)

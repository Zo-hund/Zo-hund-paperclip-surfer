# Operator Guide: Running the Work Order Pipeline

This guide covers how to operate the 4-stage pipeline, monitor execution, troubleshoot failures, and understand evaluation logic.

**Audience:** Pipeline operators and developers who run and maintain the system.

## Prerequisites

### Environment Setup

1. **Node.js** installed (v18+)
2. **Google Drive access** — Can read/write to `AMX-LABS` folder
3. **Paperclip running** — API at `http://localhost:3100`
4. **Environment variables** configured:
   ```bash
   PAPERCLIP_API_URL=http://localhost:3100
   PAPERCLIP_BOARD_TOKEN=pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc
   AMX_COMPANY_ID=dece557d-8849-4040-b8ad-e0e235a54b52
   GOOGLE_DRIVE_BASE_PATH=G:\My Drive\AMX-AIR-HUBS-HQ-ROOT\AMX-AIR-HUB-FOLDER-OPPRRC\AMX-LABS
   ```

   See [CONFIGURATION](CONFIGURATION.md) for full setup.

3. **Dependencies installed:**
   ```bash
   cd /path/to/tmp_surfers
   pnpm install
   ```

## Running the Pipeline

### Full Pipeline (All 4 Stages)

Run stages sequentially:

```bash
# Stage 1: Intake (validate, move to QUEUED)
node scripts/wo-pipeline.mjs intake

# Stage 2: Evaluation (score, create SIM issues)
node scripts/wo-pipeline.mjs eval

# Stage 3: Agentic (assign LIVE issues, agents work)
node scripts/wo-pipeline.mjs agentic

# Stage 4: Output (verify deliverables, complete)
node scripts/wo-pipeline.mjs output

# Promote SIM→LIVE (if criteria met)
node scripts/wo-pipeline.mjs promote
```

### Individual Stages (Selective Execution)

Run specific stages if you need to re-process or troubleshoot:

```bash
# Re-run intake only
node scripts/wo-pipeline.mjs intake

# Skip intake, just evaluate
node scripts/wo-pipeline.mjs eval

# Process only agentic (agent assignments)
node scripts/wo-pipeline.mjs agentic

# Finalize outputs
node scripts/wo-pipeline.mjs output

# Manual promotion from SIM to LIVE
node scripts/wo-pipeline.mjs promote
```

### Check Pipeline Status

```bash
node scripts/wo-pipeline.mjs status
```

**Output example:**
```
Work Order Pipeline Status
========================

INBOX (Initial submissions):
  0 work orders

QUEUED (Awaiting evaluation):
  1 work order
  - WO-2026-001 (internal, sim)

RUNNING (Agent is working):
  0 work orders

COMPLETE (Delivered):
  2 work orders
  - WO-2026-001 (eval score 0.88)
  - WO-2026-002 (eval score 0.91)

FAILED:
  0 work orders

TOTAL: 3 WOs in pipeline
```

## Stage 1: Intake

**What it does:** Validates work order JSON files and moves them from INBOX → QUEUED

**Command:**
```bash
node scripts/wo-pipeline.mjs intake
```

**Processing steps:**
1. Scans `WORK_ORDERS/INTERNAL/INBOX/` and `EXTERNAL/INBOX/`
2. For each JSON file:
   - Validates JSON syntax
   - Checks required fields (wo_id, request_type, work_order, routing, eval, opprrc_output)
   - Validates field types and values
   - Checks if `routing.project_id` exists in Paperclip
3. Moves valid WOs to `WORK_ORDERS/[INTERNAL|EXTERNAL]/QUEUED/`
4. Writes error details to `FAILED/` folder

**Expected output:**
```
[INTAKE] Starting intake...
[INTAKE] Found 2 WOs in INBOX
[INTAKE] ✓ WO-2026-001: Valid → QUEUED
[INTAKE] ✗ WO-2026-002: Missing field 'deadline_iso' → FAILED
[INTAKE] Summary: 1 valid, 1 failed
```

### Intake Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid JSON syntax` | Malformed JSON (comma, quote, bracket) | Fix JSON syntax in the WO file |
| `Missing required field: X` | Field not in JSON | Add the field from QUICK-START table |
| `Invalid project_id` | Project doesn't exist in Paperclip | Check Paperclip, get correct project ID |
| `Invalid deadline_iso` | Not ISO 8601 format | Use `YYYY-MM-DDTHH:MM:SSZ` |
| `Invalid priority` | Not one of: critical, high, medium, low | Use one of the 4 values |
| `File not valid UTF-8` | Encoding issue | Save JSON as UTF-8 (not ANSI/Latin1) |

---

## Stage 2: Evaluation

**What it does:** Scores work orders against weighted criteria and creates test (SIM) Paperclip issues

**Command:**
```bash
node scripts/wo-pipeline.mjs eval
```

**Processing steps:**
1. Reads all WOs in `PROCESSING/QUEUED/`
2. Loads eval criteria from `EVALS/SCORING/SUCCESS_CRITERIA.json`
3. Loads scoring weights from `EVALS/SCORING/SCORING_WEIGHTS.json`
4. For each WO:
   - Scores against specified criteria
   - Creates a **SIM Paperclip issue** (test mode, doesn't execute real work)
   - Writes eval result JSON to `EVALS/RESULTS/`
   - Moves WO to `PROCESSING/RUNNING/`
5. Outputs eval scores for promotion decision

**Expected output:**
```
[EVAL] Starting evaluation...
[EVAL] Loaded 5 success criteria
[EVAL] Found 1 WO in QUEUED
[EVAL] WO-2026-001:
  - Criteria: completeness ✓, accuracy ✓, timeliness ✗
  - Score: 0.88 (2/3 passed)
  - SIM Issue: AMXA-2287 (COO assigned)
[EVAL] Eval results written to EVALS/RESULTS/WO-2026-001-eval.json
```

### Understanding Eval Scores

Scores range from **0.0 to 1.0**:

```
0.0 ─────────────────────────────────────── 1.0
│    │    │    │    │    │    │    │    │
0.0  0.1  0.2  0.3  0.4  0.5  0.6  0.7  0.8  0.9  1.0
│    │    │    │    │    │    │    │    │    │    │
Low                   Medium                  High     Perfect
(reject)            (maybe promote)         (promote)
```

**Promotion logic:**
- Score ≥ `eval.min_score_to_promote` → eligible for LIVE
- If `eval.requires_manual_promotion` = true → needs operator approval before promotion
- Otherwise → auto-promoted at next `promote` stage

### Success Criteria Registry

Criteria determine what "done" means:

```json
{
  "completeness": "Does the deliverable cover all requested sections?",
  "accuracy": "Are facts, numbers, and conclusions correct?",
  "timeliness": "Was the work delivered by the deadline?",
  "formatting": "Is the output in the specified format?",
  "external_compliance": "Does it meet external/client standards?"
}
```

**How they're evaluated:**
- Each criterion is **pass/fail**
- Score = (# passed) / (# total) = 0.0 to 1.0
- Example: 2 of 3 criteria passed = 0.67 score

**Customize criteria:** Edit `EVALS/SCORING/SUCCESS_CRITERIA.json` and re-run eval stage

---

## Stage 3: Agentic

**What it does:** Creates real Paperclip issues and assigns them to agents

**Command:**
```bash
node scripts/wo-pipeline.mjs agentic
```

**Processing steps:**
1. Reads all WOs in `PROCESSING/RUNNING/` with eval score ≥ threshold
2. For each WO:
   - Creates a **LIVE Paperclip issue**
   - Looks up preferred agents in Paperclip
   - Assigns issue to first available agent
   - Embeds work order context in issue description
   - Records Paperclip issue ID in WO file
3. Agents see the issue in Paperclip and begin work

**Expected output:**
```
[AGENTIC] Starting agent assignments...
[AGENTIC] Found 1 WO in RUNNING with score >= 0.75
[AGENTIC] WO-2026-001 (preferred agents: CEO, CFO):
  - ✓ Assigned to CEO (agent_id: 482b3bd0-...)
  - Issue: AMXA-2288
  - Context embedded in description
[AGENTIC] Assignment complete
```

### Agent Assignment Logic

```
1. Get preferred agents from WO: ["CEO", "CFO"]
2. Look up agent names in Paperclip
   CEO → agent_id: 482b3bd0...
   CFO → agent_id: 1a7f6cad...
3. Try to assign to first available:
   - CEO available? YES → assign, done
   - CEO busy? Try CFO
   - CFO busy? Try others or queue
4. Create Paperclip issue with context
5. Save issue_id → WO file
```

### What Agents See

Issue description includes:
```
[WORK ORDER CONTEXT]
ID: WO-2026-001
Type: Weekly Revenue Report
Priority: high
Deadline: 2026-04-28T17:00:00Z
Deliverable Path: 05_REPORTS/BOARD-INTERNAL/
Success Criteria: completeness, accuracy, timeliness
Eval Score: 0.88

---

Description:
Generate the weekly revenue summary for board review
```

---

## Stage 4: Output

**What it does:** Verifies deliverables and finalizes work orders

**Command:**
```bash
node scripts/wo-pipeline.mjs output
```

**Processing steps:**
1. Reads all WOs in `PROCESSING/RUNNING/` that are marked complete
2. For each WO:
   - Verifies deliverable file exists at `opprrc_output.path`
   - Reads run time card from agent (execution metadata)
   - Writes chain receipt (audit trail)
   - Moves WO to `PROCESSING/COMPLETE/`
3. Outputs summary with costs, duration, scores

**Expected output:**
```
[OUTPUT] Starting output verification...
[OUTPUT] Found 1 completed WO in RUNNING
[OUTPUT] WO-2026-001:
  - Deliverable found: 05_REPORTS/BOARD-INTERNAL/WO-2026-001-...
  - Run time card: 15.4 min, 1,243 tokens, $0.02
  - Self-score: 0.90
  - Chain receipt written
  - Moved to COMPLETE
[OUTPUT] Summary: 1 verified, 0 failed
```

### Run Time Card Format

After agent execution, pipeline reads:
```json
{
  "wo_id": "WO-2026-001",
  "agent_id": "482b3bd0-f6c3-44b6-82b4-83c2c97187d7",
  "agent_name": "CEO",
  "run_id": "PAPERCLIP_RUN_ID",
  "issue_id": "AMXA-2288",
  "stage": "live",
  "started_at": "2026-04-27T14:30:00Z",
  "completed_at": "2026-04-27T14:45:23Z",
  "duration_minutes": 15.4,
  "model": "claude-opus",
  "tokens_input": 1200,
  "tokens_output": 43,
  "cost_usd": 0.018,
  "deliverable_path": "05_REPORTS/BOARD-INTERNAL/WO-2026-001-REVENUE-WEEKLY-2026-04-27.md",
  "eval_self_score": 0.90,
  "criteria_passed": ["completeness", "accuracy"],
  "criteria_failed": ["timeliness"],
  "notes": "Report completed, but ~5 minutes past deadline"
}
```

---

## Stage 5: Promotion (SIM → LIVE)

**What it does:** Promotes high-scoring SIM work orders to LIVE mode

**Command:**
```bash
node scripts/wo-pipeline.mjs promote
```

**Processing steps:**
1. Finds all WOs in `PROCESSING/RUNNING/` with status "sim"
2. For each SIM WO:
   - Checks eval score against `eval.min_score_to_promote`
   - If score ≥ threshold and no manual gate → auto-promote to LIVE
   - If score < threshold or manual gate required → hold for operator review
3. Outputs promotion decisions

**Example output:**
```
[PROMOTE] Checking SIM work orders...
[PROMOTE] WO-2026-001 (score 0.88):
  - Min score threshold: 0.75
  - Manual gate required: false
  - Decision: ✓ PROMOTE to LIVE
[PROMOTE] WO-2026-003 (score 0.71):
  - Min score threshold: 0.75
  - Decision: ✗ HOLD (score below threshold)
  - Action: Requires operator review
[PROMOTE] Summary: 1 promoted, 1 held
```

**Promotion gates:**

| Condition | Action |
|-----------|--------|
| `eval.min_score_to_promote` ≥ score | Auto-promote to LIVE |
| `eval.min_score_to_promote` < score | Hold for operator review |
| `eval.requires_manual_promotion` = true | Hold for operator approval |
| `request_type` = external + HITL gate | Hold for human approval |

### Manual Promotion

If a WO is held, you can manually promote it:

```bash
# Check which are held
node scripts/wo-pipeline.mjs status | grep HELD

# Manually promote WO-2026-003
# (edit the WO file to change "stage": "sim" to "stage": "live")
# Then run agentic again
node scripts/wo-pipeline.mjs agentic
```

---

## Monitoring & Troubleshooting

### Pipeline Status Dashboard

```bash
node scripts/wo-pipeline.mjs status
```

Shows real-time counts at each stage. Run this frequently to monitor progress.

### Check Specific Work Order

```bash
# Look at the WO file directly
cat PROCESSING/QUEUED/WO-2026-001.json

# View eval results
cat EVALS/RESULTS/WO-2026-001-eval.json

# Check for errors
cat PROCESSING/FAILED/WO-2026-001-error.json
```

### Common Failures & Solutions

| Issue | Stage | Cause | Solution |
|-------|-------|-------|----------|
| `Invalid JSON` | Intake | Syntax error in WO file | Fix JSON (use JSON validator) |
| `Project not found` | Intake | Invalid project_id | Verify project exists in Paperclip |
| `Agent not found` | Agentic | Preferred agent doesn't exist | Check Paperclip agent roster |
| `Deliverable not found` | Output | Agent didn't write to expected path | Check agent logs, verify path in WO |
| `Eval score too low` | Promote | WO doesn't meet criteria | Re-evaluate or lower threshold |
| `Paperclip API error` | Any stage | Connection issue | Verify Paperclip is running on 3100 |
| `Google Drive access denied` | Any stage | Permissions issue | Check Google Drive access |

### Re-running Failed Stages

If a stage fails, fix the issue and re-run:

```bash
# Stage failed at intake? Fix WO and re-run
node scripts/wo-pipeline.mjs intake

# Stage failed at eval? Check criteria and re-run
node scripts/wo-pipeline.mjs eval

# Already fixed in Paperclip? Re-run output
node scripts/wo-pipeline.mjs output
```

### Debugging Mode

Add `DEBUG=*` to see detailed logs:

```bash
DEBUG=* node scripts/wo-pipeline.mjs intake
```

Or check `*.log` files in the script directory.

---

## Advanced: Customizing Evaluation

### Add New Success Criteria

1. Edit `EVALS/SCORING/SUCCESS_CRITERIA.json`:
```json
{
  "completeness": "...",
  "accuracy": "...",
  "timeliness": "...",
  "formatting": "Is it in the requested format?",
  "my_new_criterion": "Custom description"
}
```

2. Update work orders to include in eval:
```json
{
  "eval": {
    "success_criteria_ids": ["completeness", "accuracy", "formatting", "my_new_criterion"],
    ...
  }
}
```

3. Re-run eval stage:
```bash
node scripts/wo-pipeline.mjs eval
```

### Adjust Scoring Weights

Edit `EVALS/SCORING/SCORING_WEIGHTS.json` to change how criteria are weighted:

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
  }
}
```

Change `eval.scoring_weights` in WO to use different profile.

### Add New Output Paths

Edit `OPPRRC_OUTPUT_MAP.json` to add delivery destinations:

```json
{
  "BOARD-INTERNAL": "05_REPORTS/BOARD-INTERNAL/",
  "CLIENTS-EXTERNAL": "05_REPORTS/CLIENTS-EXTERNAL/",
  "MY_NEW_AUDIENCE": "07_CUSTOM/MY_FOLDER/"
}
```

Then use in work orders:
```json
{
  "opprrc_output": {
    "audience": "MY_NEW_AUDIENCE",
    ...
  }
}
```

---

## Costs & Budgeting

### Check Costs Per Work Order

After output stage, costs are in the run time card:

```json
{
  "tokens_input": 1200,
  "tokens_output": 43,
  "cost_usd": 0.018
}
```

### Monthly Budget Tracking

Paperclip tracks monthly costs per agent. Check:
- Paperclip UI → Agents → Select agent → View budget
- Or query: `GET /api/agents/{agent_id}/budget`

### Cost Optimization

- Lower eval thresholds to reduce failed work (wasted tokens)
- Use appropriate success criteria (fewer = faster evals)
- Monitor agent usage per task

---

## Best Practices

1. **Run stages in order** — Don't skip or reorder stages without understanding impact
2. **Monitor status regularly** — Catch failures early with `node scripts/wo-pipeline.mjs status`
3. **Archive completed work** — Move old WOs from COMPLETE to archive folder quarterly
4. **Test with SIM first** — Always test new WO formats in SIM mode before LIVE
5. **Keep eval criteria current** — Review and update success criteria quarterly
6. **Document your changes** — Note any customizations to weights, criteria, or paths

---

## Next Steps

- **Troubleshooting specific errors?** See [TROUBLESHOOTING](TROUBLESHOOTING.md)
- **Understanding the system architecture?** See [ARCHITECTURE](ARCHITECTURE.md)
- **Need schema details?** See [SCHEMAS-AND-FORMATS](SCHEMAS-AND-FORMATS.md)

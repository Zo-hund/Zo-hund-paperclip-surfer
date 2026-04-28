# Architecture: Work Order Pipeline Design

This document explains how the work order pipeline is designed, how each stage works, data flow, and key design decisions.

**Audience:** Developers and architects extending or maintaining the system.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WORK ORDER PIPELINE                              │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ INPUT: Google Drive INBOX (JSON files)                       │   │
│  └──────────┬───────────────────────────────────────────────────┘   │
│             │                                                        │
│  ┌──────────▼──────────────────────────────────────────────────┐   │
│  │ STAGE 1: INTAKE                                              │   │
│  │ - Validate JSON syntax                                       │   │
│  │ - Validate schema (required fields, types)                   │   │
│  │ - Move valid WOs to QUEUED                                   │   │
│  │ - Write errors to FAILED                                    │   │
│  └──────────┬───────────────────────────────────────────────────┘   │
│             │                                                        │
│  ┌──────────▼──────────────────────────────────────────────────┐   │
│  │ STAGE 2: EVALUATION (Scoring)                                │   │
│  │ - Load success criteria & scoring weights                    │   │
│  │ - Score WO against criteria                                  │   │
│  │ - Create TEST (SIM) Paperclip issue                          │   │
│  │ - Write eval result JSON                                     │   │
│  │ - Decide: promote or hold?                                   │   │
│  └──────────┬───────────────────────────────────────────────────┘   │
│             │                                                        │
│  ┌──────────▼──────────────────────────────────────────────────┐   │
│  │ STAGE 3: AGENTIC (Assignment)                                │   │
│  │ - Create LIVE Paperclip issue                                │   │
│  │ - Look up preferred agents                                   │   │
│  │ - Assign issue to agent                                      │   │
│  │ - Embed WO context in issue                                  │   │
│  │ - Agent sees work in Paperclip & begins execution            │   │
│  └──────────┬───────────────────────────────────────────────────┘   │
│             │                                                        │
│  ┌──────────▼──────────────────────────────────────────────────┐   │
│  │ STAGE 4: OUTPUT (Completion)                                 │   │
│  │ - Verify deliverable file exists                             │   │
│  │ - Read run time card from agent                              │   │
│  │ - Write chain receipt (audit trail)                          │   │
│  │ - Move WO to COMPLETE                                        │   │
│  └──────────┬───────────────────────────────────────────────────┘   │
│             │                                                        │
│  ┌──────────▼──────────────────────────────────────────────────┐   │
│  │ OUTPUT: Completed work orders in OPPRRC-mapped folders       │   │
│  │ + Run time cards for cost/audit tracking                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Model

### Work Order Lifecycle

```
INBOX (created by submitter)
  ↓ [STAGE 1: INTAKE validates]
QUEUED (ready for eval)
  ↓ [STAGE 2: EVAL scores & creates SIM issue]
RUNNING (eval complete, awaiting agentic or promotion)
  ↓ [STAGE 5: PROMOTE converts SIM → LIVE (conditional)]
RUNNING (now LIVE)
  ↓ [STAGE 3: AGENTIC creates issue & assigns agent]
RUNNING (agent working)
  ↓ [agent completes, writes RTC to Paperclip]
RUNNING (agent done, awaiting output)
  ↓ [STAGE 4: OUTPUT verifies & finalizes]
COMPLETE (moved to OPPRRC path)
```

### Work Order Structure

```typescript
interface WorkOrder {
  // Identity
  wo_id: string,                          // "WO-2026-001"
  request_type: "internal" | "external",  // Determines HITL gates
  stage: "sim" | "live",                  // Test vs. production
  
  // Work Details
  work_order: {
    title: string,                        // "Weekly Revenue Report"
    description: string,                  // Full instructions for agent
    deliverable_type: string,             // "report", "code", "data"
    priority: "critical" | "high" | "medium" | "low",
    deadline_iso: string,                 // ISO 8601: "2026-04-28T17:00:00Z"
  },
  
  // Requestor Info
  requestor: {
    agent_or_user: string,                // "CEO", "CFO", "John Doe"
    partner_name: string,                 // Team or partner name
  },
  
  // Routing to Paperclip
  routing: {
    project_id: string,                   // Paperclip project UUID
    preferred_agents: string[],           // ["CEO", "CFO"] in order
    hitl_required_before_delivery: boolean, // Approval gate for external
  },
  
  // Output Routing (OPPRRC)
  opprrc_output: {
    audience: string,                     // "BOARD-INTERNAL", "CLIENTS-EXTERNAL"
    filename_pattern: string,             // "WO-{wo_id}-{slug}-{date}.md"
    also_write_to_partner_folder?: string,
    path: string,                         // "05_REPORTS/BOARD-INTERNAL/"
  },
  
  // Evaluation Policy
  eval: {
    scoring_weights: string,              // Profile name: "default", "strict"
    success_criteria_ids: string[],       // ["completeness", "accuracy"]
    min_score_to_promote: number,         // 0.0-1.0 threshold to go LIVE
    requires_manual_promotion: boolean,   // Operator approval required?
  },
  
  // Internal (added by pipeline)
  _paperclip_issue_id?: string,           // AMXA-2287 (SIM issue)
  _paperclip_issue_identifier?: string,   // For lookup
  _eval_score?: number,                   // 0.0-1.0
  _promoted_at?: string,                  // Timestamp when SIM→LIVE
  _live_issue_id?: string,                // AMXA-2288 (LIVE issue after agentic)
}
```

---

## Stage 1: Intake

**Purpose:** Validate work order JSON and prepare for evaluation.

**Inputs:**
- JSON files in `WORK_ORDERS/[INTERNAL|EXTERNAL]/INBOX/`

**Outputs:**
- Valid WOs moved to `WORK_ORDERS/[INTERNAL|EXTERNAL]/QUEUED/`
- Invalid WOs + error details moved to `PROCESSING/FAILED/`

**Processing:**

```javascript
async function stageIntake() {
  // 1. Scan INTERNAL/INBOX and EXTERNAL/INBOX
  const woFiles = scanInboxFolders();
  
  for (const woFile of woFiles) {
    try {
      // 2. Parse JSON
      const wo = JSON.parse(readFile(woFile));
      
      // 3. Validate schema
      validateWorkOrderSchema(wo); // throws if invalid
      
      // 4. Validate business logic
      validateProjectExists(wo.routing.project_id);
      validateDeadlineFuture(wo.work_order.deadline_iso);
      
      // 5. Move to QUEUED
      moveFile(woFile, `QUEUED/${wo.wo_id}.json`);
      
    } catch (error) {
      // Move to FAILED with error details
      writeFile(`FAILED/${wo.wo_id}-error.json`, {
        wo_id: wo.wo_id,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}
```

**Schema Validation:**
- Required fields check
- Field type validation (string, array, boolean, number)
- Enum validation (priority in ["critical", "high", "medium", "low"])
- Format validation (ISO 8601 dates, UUIDs)
- Business logic checks (deadline in future, project exists)

**Design Decision:** Single-pass validation
- ✓ Fast, simple, easy to debug
- ✓ Rejects clearly invalid WOs early
- ✗ Doesn't do semantic checks (e.g., "is this agent realistic for this task?")

---

## Stage 2: Evaluation

**Purpose:** Score work orders against success criteria and create test (SIM) Paperclip issues.

**Inputs:**
- WO files in `WORK_ORDERS/[INTERNAL|EXTERNAL]/QUEUED/`
- Success criteria: `EVALS/SCORING/SUCCESS_CRITERIA.json`
- Scoring weights: `EVALS/SCORING/SCORING_WEIGHTS.json`

**Outputs:**
- Eval result JSON in `EVALS/RESULTS/WO-{wo_id}-eval.json`
- SIM Paperclip issue created (test, no real execution)
- WO moved to `PROCESSING/RUNNING/` with `_eval_score` added

**Scoring Algorithm:**

```javascript
async function stageEval() {
  const queued = readFolder(`QUEUED/`);
  const criteria = readJSON(`EVALS/SCORING/SUCCESS_CRITERIA.json`);
  const weights = readJSON(`EVALS/SCORING/SCORING_WEIGHTS.json`);
  
  for (const wo of queued) {
    // 1. Get scoring profile
    const profile = weights[wo.eval.scoring_weights];
    const criteriaToCheck = wo.eval.success_criteria_ids;
    
    // 2. Evaluate each criterion (simulated)
    const results = {};
    for (const cid of criteriaToCheck) {
      // In a real system, this might call an LLM or human reviewer
      // For now, deterministic evaluation
      results[cid] = evaluateCriterion(cid, wo);
    }
    
    // 3. Calculate score
    let score = 0;
    for (const cid of criteriaToCheck) {
      score += results[cid] ? profile[cid] : 0;
    }
    // Normalize (sum of weights might not be 1.0)
    const totalWeight = criteriaToCheck.reduce((s, c) => s + (profile[c] || 0), 0);
    score = score / totalWeight;
    
    // 4. Create SIM Paperclip issue (test mode)
    const simIssue = await createPaperclipIssue({
      title: `[SIM] ${wo.work_order.title}`,
      description: formatIssueDescription(wo),
      priority: wo.work_order.priority,
      projectId: wo.routing.project_id,
      // NOT assigning to agent yet (still SIM)
    });
    
    // 5. Write eval result
    writeJSON(`EVALS/RESULTS/${wo.wo_id}-eval.json`, {
      wo_id: wo.wo_id,
      score: score,
      passed: Object.keys(results).filter(c => results[c]),
      failed: Object.keys(results).filter(c => !results[c]),
      sim_issue_id: simIssue.id,
      sim_issue_identifier: simIssue.identifier,
      timestamp: new Date().toISOString()
    });
    
    // 6. Update WO and move to RUNNING
    wo._eval_score = score;
    wo._paperclip_issue_id = simIssue.id;
    wo._paperclip_issue_identifier = simIssue.identifier;
    writeJSON(`PROCESSING/RUNNING/${wo.wo_id}.json`, wo);
  }
}
```

**Scoring Weights Example:**

```json
{
  "default": {
    "completeness": 0.4,     // 40% of final score
    "accuracy": 0.4,         // 40% of final score
    "timeliness": 0.2        // 20% of final score
  },
  "external_strict": {
    "completeness": 0.3,
    "accuracy": 0.5,         // More strict on accuracy
    "timeliness": 0.2
  }
}
```

**Score Calculation Example:**

WO with criteria ["completeness", "accuracy", "timeliness"] and profile "default":
- completeness passed ✓ → +0.4
- accuracy passed ✓ → +0.4
- timeliness failed ✗ → +0.0
- **Total: 0.8** (2 of 3 passed)

**SIM vs. LIVE Issues:**

| Aspect | SIM | LIVE |
|--------|-----|------|
| **Purpose** | Test, scoring, evaluation | Real work, agent execution |
| **Agent assignment** | None yet | Assigned to preferred agent |
| **Agent sees it** | No (internal only) | Yes, in their dashboard |
| **Cost impact** | None (no execution) | Real tokens consumed |
| **Created in** | Stage 2 (Eval) | Stage 3 (Agentic) |

**Design Decision:** Create SIM issues for testing
- ✓ Catch problematic WOs before agent execution
- ✓ Score WOs objectively before promotion
- ✓ Track which criteria matter most
- ✗ SIM evaluation may not match real agent performance

---

## Stage 3: Agentic

**Purpose:** Assign work to agents by creating LIVE Paperclip issues.

**Inputs:**
- WO files in `PROCESSING/RUNNING/` with `_eval_score`
- Agent roster from Paperclip

**Outputs:**
- LIVE Paperclip issues created and assigned
- WO updated with `_live_issue_id` and `_live_issue_identifier`
- WO remains in `PROCESSING/RUNNING/` (awaiting agent completion)

**Processing:**

```javascript
async function stageAgenticRun() {
  const running = readFolder(`PROCESSING/RUNNING/`);
  
  for (const wo of running) {
    // Skip if already assigned to LIVE issue
    if (wo._live_issue_id) {
      continue;
    }
    
    // 1. Check if ready for agentic (not SIM anymore)
    if (wo.stage === "sim" && !wo._promoted_at) {
      // Still in SIM, skip (wait for promotion)
      continue;
    }
    
    // 2. Get preferred agents
    const preferredNames = wo.routing.preferred_agents;
    const agents = await getPaperclipAgents();
    
    // 3. Find first available agent
    let assignedAgent = null;
    for (const name of preferredNames) {
      const agent = agents.find(a => a.name === name);
      if (agent && agent.status !== "paused") {
        assignedAgent = agent;
        break;
      }
    }
    
    if (!assignedAgent) {
      // No agent available, skip for now (retry next cycle)
      continue;
    }
    
    // 4. Create LIVE issue
    const liveIssue = await createPaperclipIssue({
      title: wo.work_order.title,
      description: formatIssueDescription(wo),  // Full context
      priority: wo.work_order.priority,
      projectId: wo.routing.project_id,
      assigneeId: assignedAgent.id,             // ASSIGNED THIS TIME
      labels: [`wo:${wo.wo_id}`, `type:${wo.work_order.deliverable_type}`],
    });
    
    // 5. Update WO with issue reference
    wo._live_issue_id = liveIssue.id;
    wo._live_issue_identifier = liveIssue.identifier;
    wo._assigned_agent_id = assignedAgent.id;
    wo._assigned_agent_name = assignedAgent.name;
    
    // 6. Save updated WO
    writeJSON(`PROCESSING/RUNNING/${wo.wo_id}.json`, wo);
  }
}
```

**Issue Description Format:**

```
[WORK ORDER]
ID: WO-2026-001
Priority: high
Deadline: 2026-04-28T17:00:00Z
Output Path: 05_REPORTS/BOARD-INTERNAL/

---

Generate the weekly revenue summary for board review.

Include:
- Total revenue by product line
- YoY growth comparison
- Key metrics dashboard
- Recommendations for next week
```

**Agent Assignment Strategy:**
1. List preferred agents in priority order
2. Try to assign to first available
3. If unavailable (paused, busy), try next in list
4. If all unavailable, skip WO (will retry next cycle)

**Design Decision:** Synchronous assignment on creation
- ✓ Issue is ready immediately
- ✓ No need for separate assignment service
- ✗ If no agent available, WO sits in RUNNING (manual intervention needed)

---

## Stage 4: Output

**Purpose:** Verify deliverables and finalize work order completion.

**Inputs:**
- WO files in `PROCESSING/RUNNING/` with `_live_issue_id`
- Run time card from Paperclip (after agent execution)
- Deliverable files in output paths

**Outputs:**
- WO moved to `PROCESSING/COMPLETE/`
- Chain receipt written to `WORK-ORDER-CHAIN/`
- Cost & execution metadata saved

**Processing:**

```javascript
async function stageOutput() {
  const running = readFolder(`PROCESSING/RUNNING/`);
  
  for (const wo of running) {
    // 1. Skip if not assigned to agent yet
    if (!wo._live_issue_id) {
      continue;
    }
    
    // 2. Check if issue is closed/complete
    const issue = await getPaperclipIssue(wo._live_issue_id);
    if (issue.status !== "closed") {
      // Agent still working, skip
      continue;
    }
    
    // 3. Read run time card from Paperclip
    const rtc = await getPaperclipRunTimeCard(wo._live_issue_id);
    if (!rtc) {
      // Agent didn't write RTC yet, skip
      continue;
    }
    
    // 4. Verify deliverable exists
    const delivPath = rtc.deliverable_path;
    if (!fileExists(delivPath)) {
      // Deliverable missing, move to FAILED
      moveFile(`RUNNING/${wo.wo_id}.json`, `FAILED/${wo.wo_id}.json`);
      continue;
    }
    
    // 5. Write chain receipt (audit trail)
    const chainReceipt = {
      wo_id: wo.wo_id,
      request_type: wo.request_type,
      agent_id: wo._assigned_agent_id,
      agent_name: wo._assigned_agent_name,
      issue_id: wo._live_issue_id,
      run_time_card: rtc,
      deliverable_path: delivPath,
      deliverable_size_bytes: getFileSize(delivPath),
      deliverable_hash_sha256: hashFile(delivPath),
      completed_at: new Date().toISOString(),
      eval_score: wo._eval_score,
      agent_self_score: rtc.eval_self_score,
    };
    
    writeJSON(`WORK-ORDER-CHAIN/${wo.wo_id}-RECEIPT.json`, chainReceipt);
    
    // 6. Move to COMPLETE
    moveFile(`RUNNING/${wo.wo_id}.json`, `COMPLETE/${wo.wo_id}.json`);
  }
}
```

**Run Time Card (from Paperclip after agent execution):**

```json
{
  "wo_id": "WO-2026-001",
  "agent_id": "482b3bd0-...",
  "agent_name": "CEO",
  "run_id": "run_abc123...",
  "issue_id": "AMXA-2288",
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
  "notes": "Report completed, 5 min past deadline"
}
```

**Chain Receipt (generated by pipeline):**

```json
{
  "wo_id": "WO-2026-001",
  "agent_name": "CEO",
  "issue_id": "AMXA-2288",
  "completed_at": "2026-04-27T14:45:23Z",
  "deliverable_path": "05_REPORTS/BOARD-INTERNAL/WO-2026-001-...",
  "deliverable_hash_sha256": "abc123...",
  "eval_score": 0.88,
  "agent_self_score": 0.90,
  "tokens": 1243,
  "cost_usd": 0.018
}
```

**Design Decision:** Asynchronous output verification
- ✓ Agent completes, pipeline picks up when ready
- ✓ No blocking on Paperclip API
- ✗ If deliverable location wrong, WO fails (needs manual intervention)

---

## Stage 5: Promotion (SIM → LIVE)

**Purpose:** Convert high-scoring SIM work orders to LIVE mode before agentic assignment.

**Inputs:**
- WO files in `PROCESSING/RUNNING/` with `stage == "sim"` and `_eval_score`

**Outputs:**
- WO updated with `stage = "live"` and `_promoted_at` timestamp
- Ready for Stage 3 (Agentic) on next cycle

**Processing:**

```javascript
async function stagePromote() {
  const running = readFolder(`PROCESSING/RUNNING/`);
  
  for (const wo of running) {
    // Skip if already LIVE or has LIVE issue
    if (wo.stage === "live" || wo._live_issue_id) {
      continue;
    }
    
    // Check promotion criteria
    const meetsScore = wo._eval_score >= wo.eval.min_score_to_promote;
    const needsManualApproval = wo.eval.requires_manual_promotion;
    const isExternal = wo.request_type === "external";
    
    if (!meetsScore) {
      // Eval score too low, hold for review
      console.log(`HOLD: ${wo.wo_id} score ${wo._eval_score} < ${wo.eval.min_score_to_promote}`);
      continue;
    }
    
    if (needsManualApproval || isExternal) {
      // Requires operator sign-off, hold
      console.log(`HITL GATE: ${wo.wo_id} requires manual approval`);
      continue;
    }
    
    // AUTO-PROMOTE
    wo.stage = "live";
    wo._promoted_at = new Date().toISOString();
    writeJSON(`PROCESSING/RUNNING/${wo.wo_id}.json`, wo);
    console.log(`PROMOTED: ${wo.wo_id} → LIVE`);
  }
}
```

**Promotion Gates:**

```
┌─────────────────────────────────────────────┐
│ Promotion Decision Tree                      │
├─────────────────────────────────────────────┤
│                                              │
│ Score >= min_score_to_promote? ──NO──> HOLD │
│         │                                    │
│        YES                                   │
│         │                                    │
│ requires_manual_promotion? ──YES──> HOLD    │
│         │                                    │
│        NO                                    │
│         │                                    │
│ request_type == external? ──YES──> HOLD     │
│         │                                    │
│        NO                                    │
│         │                                    │
│        AUTO-PROMOTE ──────────────────────> │
│             ↓                                 │
│         Set stage = "live"                   │
│         Set _promoted_at = now               │
│                                              │
└─────────────────────────────────────────────┘
```

**Manual Promotion:**

To manually promote a held WO:

```bash
# 1. Edit the WO file
vim PROCESSING/RUNNING/WO-2026-001.json

# 2. Change:
# "stage": "sim"  →  "stage": "live"
# Add: "_promoted_at": "2026-04-27T15:00:00Z"

# 3. Save and re-run agentic
node scripts/wo-pipeline.mjs agentic
```

---

## Paperclip Integration

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/companies/{cid}/issues` | POST | Create new issue (Stage 2 & 3) |
| `/issues/{id}` | GET | Get issue status (Stage 4) |
| `/companies/{cid}/agents?limit=100` | GET | List agents for assignment (Stage 3) |
| `/issues/{id}/activity` | GET | Get activity log (for chain receipts) |

### Authentication

All requests include:
```
Authorization: Bearer {PAPERCLIP_BOARD_TOKEN}
Content-Type: application/json
```

### Issue Creation Payload (Stage 2 SIM)

```json
{
  "title": "[SIM] Weekly Revenue Report",
  "description": "[WORK ORDER]\nID: WO-2026-001\n...",
  "priority": "high",
  "projectId": "d1234567-...",
  "labels": ["sim", "revenue"]
}
```

### Issue Creation Payload (Stage 3 LIVE)

```json
{
  "title": "Weekly Revenue Report",
  "description": "[WORK ORDER]\nID: WO-2026-001\n...",
  "priority": "high",
  "projectId": "d1234567-...",
  "assigneeId": "482b3bd0-...",
  "labels": ["wo:WO-2026-001", "type:report"]
}
```

---

## Configuration Files

### SUCCESS_CRITERIA.json

Defines what "done" means:

```json
{
  "completeness": "Does the deliverable cover all requested sections?",
  "accuracy": "Are facts, numbers, and conclusions correct?",
  "timeliness": "Was the work delivered by the deadline?",
  "formatting": "Is the output in the specified format?",
  "external_compliance": "Does it meet external standards?"
}
```

### SCORING_WEIGHTS.json

Defines how criteria are weighted:

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

### OPPRRC_OUTPUT_MAP.json

Maps audiences to delivery paths:

```json
{
  "BOARD-INTERNAL": "05_REPORTS/BOARD-INTERNAL/",
  "CLIENTS-EXTERNAL": "05_REPORTS/CLIENTS-EXTERNAL/",
  "INTERNAL-OPERATIONS": "04_OPERATIONS/INTERNAL/"
}
```

---

## Design Decisions & Tradeoffs

### 1. Synchronous Stages (No Event Bus)

**Decision:** Run stages sequentially via CLI, not via event bus.

**Rationale:**
- ✓ Simple, no infrastructure overhead
- ✓ Easy to debug (predictable execution order)
- ✓ Operator has explicit control
- ✗ Not real-time (requires polling `node ... status`)

**Alternative:** Event-driven (Kafka, RabbitMQ)
- More real-time, but adds operational complexity

### 2. File-Based State (No Database)

**Decision:** WOs stored as JSON files in Google Drive folders, not in a database.

**Rationale:**
- ✓ Familiar to non-engineers (files on drive)
- ✓ Version control via Drive history
- ✓ No DB setup or migrations
- ✗ No transactions, potential race conditions
- ✗ Slower for large numbers of WOs

**Alternative:** PostgreSQL
- Atomic transactions, faster queries, but requires DB admin

### 3. Deterministic Evaluation (No LLM Scoring)

**Decision:** Success criteria evaluated deterministically (pass/fail), not via LLM.

**Rationale:**
- ✓ Deterministic, reproducible scores
- ✓ Fast (no API calls)
- ✓ Cheap
- ✗ Can't adapt to nuanced quality assessment

**Alternative:** LLM-based scoring
- More flexible, but slower and more expensive

### 4. Manual Promotion Gates (HITL)

**Decision:** External WOs and high-threshold WOs require manual operator approval.

**Rationale:**
- ✓ Prevents accidental delivery to clients
- ✓ Operator has final say
- ✓ Auditable (who approved what, when)
- ✗ Slows down fast-moving teams

**Alternative:** Fully automated
- Faster, but riskier for client-facing work

---

## Extensibility

### Add a New Evaluation Criterion

1. Add to `SUCCESS_CRITERIA.json`:
   ```json
   { "my_criterion": "Description of what we're checking" }
   ```

2. Update scoring weights in `SCORING_WEIGHTS.json`

3. WOs that reference it will be scored differently

### Add a New Output Audience

1. Add to `OPPRRC_OUTPUT_MAP.json`:
   ```json
   { "MY_AUDIENCE": "path/to/deliverables/" }
   ```

2. Use in WO `opprrc_output.audience`

### Add a Custom Scoring Profile

1. Add to `SCORING_WEIGHTS.json`:
   ```json
   {
     "my_profile": {
       "completeness": 0.5,
       "accuracy": 0.3,
       "timeliness": 0.2
     }
   }
   ```

2. Reference in WO `eval.scoring_weights = "my_profile"`

### Integrate with External System

Example: Send completed WOs to Slack:

```javascript
// In stageOutput(), after moving to COMPLETE:
await slackNotify({
  channel: "#deliverables",
  text: `✓ ${wo.wo_id} completed by ${wo._assigned_agent_name}`,
  link: delivPath
});
```

---

## Next Steps

- **Implement something new?** See [CONFIGURATION](CONFIGURATION.md)
- **Understand the code?** See inline comments in `scripts/wo-pipeline.mjs`
- **Operating it?** See [OPERATOR-GUIDE](OPERATOR-GUIDE.md)

#!/usr/bin/env node
/**
 * AMX Louisville Run-of-Show Orchestrator
 * Louisville, KY — Human-Agentic Workflow Test
 *
 * 12 work orders covering every stakeholder type:
 *   Non-profit · Business · School · Teacher · Parent · Learner
 *   Earner · Community Partner · Sponsored Partner · Volunteer · Donor · Microservices
 *
 * Runs full pipeline: SIM intake → eval → Paperclip issues → LIVE promotion candidates
 *
 * Usage:
 *   node scripts/lou-ros.mjs            # Full run-of-show (all stages)
 *   node scripts/lou-ros.mjs --intake   # Stage 1 only
 *   node scripts/lou-ros.mjs --eval     # Stage 2 only (from QUEUED)
 *   node scripts/lou-ros.mjs --run      # Stage 3 only (create issues)
 *   node scripts/lou-ros.mjs --status   # Show run-of-show dashboard
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const BASE = 'G:\\My Drive\\AMX-AIR-HUBS-HQ-ROOT\\AMX-AIR-HUB-FOLDER-OPPRRC\\AMX-LABS';
const WO_ROOT = path.join(BASE, '00_HUB_CONFIG', 'WORK_ORDERS');
const PIPELINE = path.resolve('./scripts/wo-pipeline.mjs');

const PAPERCLIP_API = process.env.PAPERCLIP_API_URL || 'http://localhost:3100';
const BOARD_TOKEN = process.env.PAPERCLIP_BOARD_TOKEN || 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc';
const AMX_COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${BOARD_TOKEN}`,
};

// ─── RUN-OF-SHOW MANIFEST ─────────────────────────────────────────────────────
// Louisville, KY work day schedule (Eastern Time, 9am–5pm)

const RUN_OF_SHOW = [
  // ── MORNING SHIFT (9am–12pm) ──────────────────────────────────────────────
  {
    slot: '09:00–10:00', wo_id: 'WO-LOU-001', type: 'INTERNAL',
    stakeholder: 'Non-Profit', partner: 'Kentucky Science Center',
    agent: 'CEO', deliverable: 'Q1 Impact Report', hitl: false,
    microservice: null
  },
  {
    slot: '09:00–11:00', wo_id: 'WO-LOU-003', type: 'INTERNAL',
    stakeholder: 'School / Teacher / Parent', partner: 'Kacoon Academy',
    agent: 'COO', deliverable: 'Curriculum Outline', hitl: false,
    microservice: null
  },
  {
    slot: '10:00–11:00', wo_id: 'WO-LOU-002', type: 'EXTERNAL',
    stakeholder: 'Business / Sponsored Partner', partner: 'Blak Koffee',
    agent: 'CMO', deliverable: 'Co-Brand Campaign', hitl: true,
    microservice: null
  },
  {
    slot: '10:30–11:30', wo_id: 'WO-LOU-004', type: 'EXTERNAL',
    stakeholder: 'Parent / Community', partner: 'East Broadway Theater',
    agent: 'Create', deliverable: 'Family Event Announcement', hitl: true,
    microservice: { router: 'image-microservice-router', model: 'gpt-image-1', tier: 'standard', swap: 'pitstop' }
  },
  {
    slot: '11:00–12:00', wo_id: 'WO-LOU-005', type: 'INTERNAL',
    stakeholder: 'Learner', partner: 'Tech-at-Nite',
    agent: 'V3 Audit Lead 2', deliverable: 'Completion Certificate', hitl: false,
    microservice: null
  },
  {
    slot: '11:00–13:00', wo_id: 'WO-LOU-006', type: 'EXTERNAL',
    stakeholder: 'Earner / Non-Profit', partner: '50-50 Mentoring',
    agent: 'CFO', deliverable: 'Workforce Dev Brief', hitl: true,
    microservice: null
  },
  // ── AFTERNOON SHIFT (1pm–5pm) ─────────────────────────────────────────────
  {
    slot: '13:00–14:00', wo_id: 'WO-LOU-007', type: 'INTERNAL',
    stakeholder: 'Community Partner', partner: 'Screens and Dreams',
    agent: 'CMO', deliverable: 'Event Run Sheet', hitl: false,
    microservice: null
  },
  {
    slot: '13:00–15:00', wo_id: 'WO-LOU-008', type: 'EXTERNAL',
    stakeholder: 'Sponsored Partner', partner: 'Graded Gaming',
    agent: 'Create', deliverable: 'Sponsorship Deck Outline', hitl: true,
    microservice: null
  },
  {
    slot: '14:00–15:00', wo_id: 'WO-LOU-009', type: 'EXTERNAL',
    stakeholder: 'Volunteer', partner: 'DerbyX',
    agent: 'CMO', deliverable: 'Volunteer Orientation Guide', hitl: true,
    microservice: null
  },
  {
    slot: '14:00–16:00', wo_id: 'WO-LOU-010', type: 'EXTERNAL',
    stakeholder: 'Donor', partner: 'Real Dealr',
    agent: 'CFO', deliverable: 'Donor Impact Statement', hitl: true,
    microservice: null
  },
  {
    slot: '15:00–16:00', wo_id: 'WO-LOU-011', type: 'INTERNAL',
    stakeholder: 'Microservice — Image', partner: 'AMX Brand',
    agent: 'Create', deliverable: 'Social Graphics Pack', hitl: false,
    microservice: { router: 'image-microservice-router', model: 'gpt-image-2', tier: 'flagship', swap: 'on-the-spot' }
  },
  {
    slot: '15:00–17:00', wo_id: 'WO-LOU-012', type: 'EXTERNAL',
    stakeholder: 'Microservice — Video', partner: 'Tech-at-Nite',
    agent: 'RAZ', deliverable: 'Sizzle Reel Brief', hitl: true,
    microservice: { router: 'video-microservice-router', model: 'auto', tier: 'standard', swap: 'pitstop' }
  },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function log(tag, msg) {
  console.log(`[${ts()}] [${tag.padEnd(8)}] ${msg}`);
}

function separator(label) {
  const line = '─'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(`${line}`);
}

async function api(method, endpoint, body) {
  const res = await fetch(`${PAPERCLIP_API}/api${endpoint}`, {
    method,
    headers: HEADERS,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`API ${method} ${endpoint} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function readWoFromInbox(wo_id, type) {
  const inbox = path.join(WO_ROOT, type, 'INBOX', `${wo_id}.json`);
  const queued = path.join(WO_ROOT, 'PROCESSING', 'QUEUED', `${wo_id}.json`);
  const running = path.join(WO_ROOT, 'PROCESSING', 'RUNNING', `${wo_id}.json`);
  for (const p of [running, queued, inbox]) {
    if (fs.existsSync(p)) return { wo: JSON.parse(fs.readFileSync(p, 'utf8')), foundAt: p };
  }
  return null;
}

// ─── STAGE 1: INTAKE ─────────────────────────────────────────────────────────

async function runIntake() {
  separator('STAGE 1 — INTAKE  |  Scanning Louisville INBOX folders');
  const results = [];

  for (const entry of RUN_OF_SHOW) {
    const inboxPath = path.join(WO_ROOT, entry.type, 'INBOX', `${entry.wo_id}.json`);
    const queuedPath = path.join(WO_ROOT, 'PROCESSING', 'QUEUED', `${entry.wo_id}.json`);

    if (!fs.existsSync(inboxPath)) {
      log('INTAKE', `  SKIP  ${entry.wo_id} — not in INBOX (already processed or missing)`);
      results.push({ wo_id: entry.wo_id, status: 'skipped' });
      continue;
    }

    try {
      const wo = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
      const required = ['wo_id', 'request_type', 'stage', 'work_order', 'routing', 'opprrc_output'];
      const missing = required.filter(k => !wo[k]);

      if (missing.length > 0) {
        log('INTAKE', `  FAIL  ${entry.wo_id} — missing: ${missing.join(', ')}`);
        results.push({ wo_id: entry.wo_id, status: 'failed', reason: `missing: ${missing.join(', ')}` });
        continue;
      }

      fs.mkdirSync(path.dirname(queuedPath), { recursive: true });
      fs.copyFileSync(inboxPath, queuedPath);
      fs.unlinkSync(inboxPath);

      log('INTAKE', `  OK    ${entry.wo_id} → QUEUED  [${entry.stakeholder}] "${wo.work_order.title.slice(0, 55)}..."`);
      results.push({ wo_id: entry.wo_id, status: 'queued', title: wo.work_order.title });
    } catch (e) {
      log('INTAKE', `  ERR   ${entry.wo_id} — ${e.message}`);
      results.push({ wo_id: entry.wo_id, status: 'error', reason: e.message });
    }
  }

  const ok = results.filter(r => r.status === 'queued').length;
  log('INTAKE', `── Stage 1 complete: ${ok}/${RUN_OF_SHOW.length} WOs queued ──`);
  return results;
}

// ─── STAGE 2: EVAL ───────────────────────────────────────────────────────────

function evalWo(wo) {
  const profileName = wo.eval?.scoring_weights || 'default';
  const criteriaIds = wo.eval?.success_criteria_ids || ['quality_gate_basic', 'delivery_path_valid'];
  const minScore = wo.eval?.min_score_to_promote || 0.82;

  const results = {};
  for (const cId of criteriaIds) {
    results[cId] = {
      status: 'PENDING',
      score: 0,
      note: 'Pre-run: will be evaluated after agent completes deliverable'
    };
  }

  return {
    wo_id: wo.wo_id,
    profile: profileName,
    criteria_count: criteriaIds.length,
    criteria_results: results,
    min_score: minScore,
    pre_run_status: 'STAGED_FOR_RUN',
    hitl_required: wo.routing?.hitl_required_before_delivery || false,
    created_at: new Date().toISOString(),
  };
}

async function runEval() {
  separator('STAGE 2 — EVAL  |  Scoring Louisville work orders');

  const resultsDir = path.join(WO_ROOT, 'EVALS', 'RESULTS');
  const runningDir = path.join(WO_ROOT, 'PROCESSING', 'RUNNING');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(runningDir, { recursive: true });

  const evalResults = [];

  for (const entry of RUN_OF_SHOW) {
    const queuedPath = path.join(WO_ROOT, 'PROCESSING', 'QUEUED', `${entry.wo_id}.json`);
    if (!fs.existsSync(queuedPath)) {
      log('EVAL', `  SKIP  ${entry.wo_id} — not in QUEUED`);
      continue;
    }

    const wo = JSON.parse(fs.readFileSync(queuedPath, 'utf8'));
    const evalResult = evalWo(wo);

    // Write eval result
    const resultFile = path.join(resultsDir, `${entry.wo_id}-EVAL.json`);
    fs.writeFileSync(resultFile, JSON.stringify(evalResult, null, 2));

    // Move to RUNNING
    const runningPath = path.join(runningDir, `${entry.wo_id}.json`);
    fs.copyFileSync(queuedPath, runningPath);
    fs.unlinkSync(queuedPath);

    const hitlBadge = evalResult.hitl_required ? ' [HITL]' : '';
    log('EVAL', `  OK    ${entry.wo_id}  profile=${evalResult.profile}  criteria=${evalResult.criteria_count}  min=${evalResult.min_score}${hitlBadge}`);
    evalResults.push(evalResult);
  }

  log('EVAL', `── Stage 2 complete: ${evalResults.length} WOs staged for agentic run ──`);
  return evalResults;
}

// ─── STAGE 3: AGENTIC RUN ────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

function buildIssueBody(wo, entry) {
  const isSim = wo.stage === 'sim';
  const hitlNote = wo.routing?.hitl_required_before_delivery
    ? '\n\n> ⚠️ **HITL REQUIRED**: Create a Paperclip approval request BEFORE writing the deliverable to the CLIENTS-EXTERNAL folder. Tag board for review.'
    : '';

  const msNote = entry.microservice
    ? `\n\n---\n\n## Microservice Routing\n\n- **Router:** \`${entry.microservice.router}\`\n- **Model:** \`${entry.microservice.model}\`\n- **Budget Tier:** \`${entry.microservice.tier}\`\n- **Swap Mode:** \`${entry.microservice.swap}\`\n- **Swap Rules:** See \`image-microservice-router\` or \`video-microservice-router\` SKILL.md`
    : '';

  return `## Work Order: ${wo.wo_id}
**Type:** ${wo.request_type.toUpperCase()} | **Priority:** ${wo.work_order.priority} | **Stage:** ${isSim ? '🧪 SIM' : '🟢 LIVE'}
**Requestor:** ${wo.requestor?.partner_name || wo.requestor?.agent_or_user}
**Deadline:** ${wo.work_order.deadline_iso}
**Location:** Louisville, KY | **Partner:** ${wo.context?.partner || 'N/A'}
**Stakeholder Type:** ${wo.context?.stakeholder_type || 'N/A'}
**Work Hours Slot:** ${wo.context?.work_hours_slot || 'N/A'}${hitlNote}${msNote}

---

## Task Instructions

${wo.work_order.description}

---

## Deliverable Requirements

- **Type:** \`${wo.work_order.deliverable_type}\`
- **Section:** \`${wo.opprrc_output.section}\`
- **Audience:** \`${wo.opprrc_output.audience}\`
- **Filename Pattern:** \`${wo.opprrc_output.filename_pattern}\`
${wo.opprrc_output.also_write_to_partner_folder ? `- **Also copy to:** \`${wo.opprrc_output.also_write_to_partner_folder}\`` : ''}

---

## Eval Success Criteria

Scoring profile: \`${wo.eval?.scoring_weights || 'default'}\`
Min score to promote: **${wo.eval?.min_score_to_promote || 0.82}**

Criteria: ${(wo.eval?.success_criteria_ids || []).map(c => `\`${c}\``).join(', ')}

---

## Run Time Card (REQUIRED)

After completing the deliverable, write a run time card to:
\`05_REPORTS\\${wo.opprrc_output.audience}\\WORK-ORDER-CHAIN\\${wo.wo_id}-RUN-TIME-CARD.json\`

\`\`\`json
{
  "wo_id": "${wo.wo_id}",
  "agent_id": "YOUR_PAPERCLIP_AGENT_ID",
  "agent_name": "YOUR_NAME",
  "issue_id": "THIS_ISSUE_ID",
  "stage": "${isSim ? 'sim' : 'live'}",
  "started_at": "ISO8601",
  "completed_at": "ISO8601",
  "duration_minutes": 0,
  "model": "MODEL_USED",
  "tokens_input": 0,
  "tokens_output": 0,
  "cost_usd": 0.0,
  "deliverable_path": "FULL_PATH_TO_OUTPUT_FILE",
  "eval_self_score": 0.0,
  "criteria_passed": [],
  "criteria_failed": [],
  "swap_history": [],
  "notes": ""
}
\`\`\`

---

## AMX Chain Traceability

- **WO ID:** \`${wo.wo_id}\`
- **Submitted:** ${wo.submitted_at}
- **Louisville Program:** ${wo.context?.partner || 'AMX Community'}
- All PATCH/POST actions MUST include X-Paperclip-Run-Id header

When complete, post a final comment confirming:
1. ✅ Deliverable path
2. ✅ Run time card path
3. Eval self-score (0.0–1.0)
4. Criteria passed / failed
`;
}

async function runAgentic() {
  separator('STAGE 3 — AGENTIC  |  Creating Paperclip issues (Louisville Run-of-Show)');

  const runningDir = path.join(WO_ROOT, 'PROCESSING', 'RUNNING');
  const issues = [];

  for (const entry of RUN_OF_SHOW) {
    const runningPath = path.join(runningDir, `${entry.wo_id}.json`);
    if (!fs.existsSync(runningPath)) {
      log('AGENT', `  SKIP  ${entry.wo_id} — not in RUNNING`);
      continue;
    }

    const wo = JSON.parse(fs.readFileSync(runningPath, 'utf8'));
    const isSim = wo.stage === 'sim';
    const PRIORITY_MAP = { normal: 'medium', urgent: 'critical' };
    const priority = PRIORITY_MAP[wo.work_order.priority] || wo.work_order.priority;

    const title = `[${isSim ? 'SIM' : 'LIVE'}] ${wo.wo_id} — ${wo.work_order.title}`;
    const description = buildIssueBody(wo, entry);

    let issue;
    try {
      issue = await api('POST', `/companies/${AMX_COMPANY_ID}/issues`, {
        title,
        description,
        priority,
        assigneeId: wo.routing.preferred_agent_id,
      });

      const hitlBadge = wo.routing?.hitl_required_before_delivery ? ' ⚠️ HITL' : '';
      const msBadge = entry.microservice ? ` 🎨 ${entry.microservice.router.split('-')[0].toUpperCase()}` : '';
      log('AGENT', `  OK    ${wo.wo_id} → Issue #${issue.number || issue.id?.slice(0,8)}  [${entry.stakeholder}]${hitlBadge}${msBadge}`);
      issues.push({ wo_id: wo.wo_id, issueId: issue.id, issueNumber: issue.number, stakeholder: entry.stakeholder });
    } catch (e) {
      log('AGENT', `  ERR   ${wo.wo_id} — ${e.message.slice(0, 80)}`);
      issues.push({ wo_id: wo.wo_id, error: e.message.slice(0, 80) });
    }
  }

  const ok = issues.filter(i => !i.error).length;
  log('AGENT', `── Stage 3 complete: ${ok}/${RUN_OF_SHOW.length} Paperclip issues created ──`);
  return issues;
}

// ─── STATUS DASHBOARD ─────────────────────────────────────────────────────────

async function showStatus() {
  separator('LOUISVILLE RUN-OF-SHOW — STATUS DASHBOARD');
  console.log(`  AMX Community Programs | Louisville, KY | Work Day: 09:00–17:00 ET`);
  console.log(`  ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}`);
  console.log();

  const header = `  ${'TIME'.padEnd(14)} ${'WO-ID'.padEnd(12)} ${'TYPE'.padEnd(10)} ${'STAKEHOLDER'.padEnd(26)} ${'PARTNER'.padEnd(24)} ${'AGENT'.padEnd(14)} ${'HITL'} ${'MEDIA'}`;
  console.log(header);
  console.log('  ' + '─'.repeat(120));

  for (const entry of RUN_OF_SHOW) {
    const hitl = entry.hitl ? '✓' : ' ';
    const media = entry.microservice
      ? (entry.microservice.router.includes('image') ? '📸' : '🎬')
      : ' ';
    const line = `  ${entry.slot.padEnd(14)} ${entry.wo_id.padEnd(12)} ${entry.type.padEnd(10)} ${entry.stakeholder.padEnd(26)} ${entry.partner.padEnd(24)} ${entry.agent.padEnd(14)} ${hitl.padEnd(5)} ${media}`;
    console.log(line);
  }

  console.log('\n  ' + '─'.repeat(120));

  // Count stats
  const internal = RUN_OF_SHOW.filter(e => e.type === 'INTERNAL').length;
  const external = RUN_OF_SHOW.filter(e => e.type === 'EXTERNAL').length;
  const hitlCount = RUN_OF_SHOW.filter(e => e.hitl).length;
  const mediaCount = RUN_OF_SHOW.filter(e => e.microservice).length;

  console.log(`
  SUMMARY
  ─────────────────────────────────────────────────────────────────────
  Total Work Orders  : ${RUN_OF_SHOW.length}
  Internal (Board)   : ${internal}   External (Clients) : ${external}
  HITL Gates         : ${hitlCount}   Media Microservices: ${mediaCount}

  STAKEHOLDER COVERAGE
  ─────────────────────────────────────────────────────────────────────
  ✓ Non-profit          → KY Science Center (WO-LOU-001, CEO)
  ✓ Business            → Blak Koffee (WO-LOU-002, CMO)
  ✓ School/Teacher      → Kacoon Academy (WO-LOU-003, COO)
  ✓ Parent/Community    → East Broadway Theater (WO-LOU-004, Create)
  ✓ Learner             → Tech-at-Nite (WO-LOU-005, V3 Audit Lead 2)
  ✓ Earner              → 50-50 Mentoring (WO-LOU-006, CFO)
  ✓ Community Partner   → Screens and Dreams (WO-LOU-007, CMO)
  ✓ Sponsored Partner   → Graded Gaming (WO-LOU-008, Create)
  ✓ Volunteer           → DerbyX (WO-LOU-009, CMO)
  ✓ Donor               → Real Dealr (WO-LOU-010, CFO)
  ✓ Microservice Image  → AMX Brand Pack (WO-LOU-011, Create, gpt-image-2)
  ✓ Microservice Video  → Tech-at-Nite Sizzle Reel (WO-LOU-012, RAZ)

  ENGINE SWAP RULES
  ─────────────────────────────────────────────────────────────────────
  WO-LOU-011  On-the-Spot  gpt-image-2 → gpt-image-1 if transparent BG needed
  WO-LOU-004  Pitstop      gpt-image-1 → upgrade only after board sign-off
  WO-LOU-012  Pitstop      video codec/resolution confirmed before generation
  `);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--status')) {
  await showStatus();
} else if (args.includes('--intake')) {
  await runIntake();
} else if (args.includes('--eval')) {
  await runEval();
} else if (args.includes('--run')) {
  await runAgentic();
} else {
  // Full run-of-show
  separator('AMX LOUISVILLE RUN-OF-SHOW  |  SIM → LIVE  |  Full Pipeline');
  console.log(`  Louisville, KY  |  9am–5pm Eastern  |  12 Work Orders  |  All Stakeholder Types`);

  await showStatus();
  await runIntake();
  await runEval();
  await runAgentic();

  separator('RUN-OF-SHOW COMPLETE');
  console.log(`  All 12 Louisville work orders have been submitted to the AMX pipeline.`);
  console.log(`  SIM issues are now live in Paperclip — agents can begin execution.`);
  console.log(`  HITL-gated WOs (6) require board approval before CLIENTS-EXTERNAL delivery.`);
  console.log(`  Run: node scripts/wo-pipeline.mjs status  to monitor progress.`);
  console.log();
}

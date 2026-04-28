#!/usr/bin/env node
/**
 * AMX Work Order Pipeline — 4-Stage Quality Control System
 *
 * STAGE 1: INTAKE   — scan G: Drive INBOX, validate WO JSON, move to QUEUED
 * STAGE 2: EVALS    — score against weights + success criteria, create sim Paperclip issues
 * STAGE 3: AGENTIC  — create/assign Paperclip issues for live agent execution
 * STAGE 4: OUTPUT   — write run time cards, verify OPPRRC delivery, AMX chain traceability
 *
 * Usage:
 *   node scripts/wo-pipeline.mjs intake          # Stage 1: scan inbox
 *   node scripts/wo-pipeline.mjs eval <wo-file>  # Stage 2: eval a specific WO
 *   node scripts/wo-pipeline.mjs run <wo-file>   # Stage 3: create Paperclip issue + assign agent
 *   node scripts/wo-pipeline.mjs promote <wo-id> # Stage 4: promote sim→live
 *   node scripts/wo-pipeline.mjs status          # Show all WO pipeline status
 *   node scripts/wo-pipeline.mjs chain <wo-id>   # Print AMX chain for a WO
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const BASE = 'G:\\My Drive\\AMX-AIR-HUBS-HQ-ROOT\\AMX-AIR-HUB-FOLDER-OPPRRC\\AMX-LABS';
const WO_ROOT = path.join(BASE, '00_HUB_CONFIG', 'WORK_ORDERS');
const SCORING_WEIGHTS = JSON.parse(fs.readFileSync(path.join(WO_ROOT, 'EVALS', 'SCORING', 'SCORING_WEIGHTS.json'), 'utf8'));
const SUCCESS_CRITERIA = JSON.parse(fs.readFileSync(path.join(WO_ROOT, 'EVALS', 'SCORING', 'SUCCESS_CRITERIA.json'), 'utf8'));
const OUTPUT_MAP = JSON.parse(fs.readFileSync(path.join(WO_ROOT, 'OPPRRC_OUTPUT_MAP.json'), 'utf8'));

const PAPERCLIP_API = process.env.PAPERCLIP_API_URL || 'http://localhost:3100';
const BOARD_TOKEN = process.env.PAPERCLIP_BOARD_TOKEN || 'pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc';
const AMX_COMPANY_ID = 'dece557d-8849-4040-b8ad-e0e235a54b52';

// OPPRRC → Drive folder ID map (verified 2026-04-27 via Drive MCP)
const DRIVE_FOLDER_IDS = {
  '05_REPORTS/BOARD-INTERNAL':   '1MEeeCXGb8vg4Ktnp_sJ4RZ9BO2WtFgO0',
  '05_REPORTS/CLIENTS-EXTERNAL': '1QQ2Drb_Tc03qJvQMfPX5Zu4hZVT-Ii8j',
  '02_PROGRAMS':                  '1Z1ZewhqFwP41yfcdgkpi78LIXcExXmY7',
  '11_MEDIA_LIBRARY':             '1Og8heTBcBNlzD2WQIelfMenPtgwjKM7H',
  '14_DEVELOPMENT':               '1DpcdWqaEvv5V9oPOW-0ncsSpbB4xMVsa',
  '04_RESOURCES':                 '1XrnHms4a-kAsfpqlnvybzzgH8h48Arkm',
  'DEFAULT':                      '1kVgFmf7fyZ7sj6Fa0rIC4T7qenhkx4Zc', // AMX-LABS root
};

function driveFolderUrl(wo) {
  const section = wo.opprrc_output?.section || '05_REPORTS';
  const audience = wo.opprrc_output?.audience || 'BOARD-INTERNAL';
  const key = `${section}/${audience}`;
  const id = DRIVE_FOLDER_IDS[key] || DRIVE_FOLDER_IDS[section] || DRIVE_FOLDER_IDS['DEFAULT'];
  return `https://drive.google.com/drive/folders/${id}`;
}

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${BOARD_TOKEN}`,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

function log(stage, msg) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`[${ts}] [${stage.padEnd(7)}] ${msg}`);
}

function scanInbox(type) {
  const inboxPath = path.join(WO_ROOT, type.toUpperCase(), 'INBOX');
  if (!fs.existsSync(inboxPath)) return [];
  return fs.readdirSync(inboxPath)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => ({ file: f, path: path.join(inboxPath, f) }));
}

function resolveOutputPath(wo) {
  const type = wo.work_order.deliverable_type;
  const audience = wo.opprrc_output.audience || 'BOARD-INTERNAL';
  const stage = wo.stage || 'sim';

  if (wo.opprrc_output.path) return wo.opprrc_output.path;

  const section = OUTPUT_MAP.routing_matrix[type]?.[audience] || `05_REPORTS\\${audience}`;
  const prefix = stage === 'sim'
    ? path.join(BASE, OUTPUT_MAP.sim_output_prefix)
    : path.join(BASE, section);
  return prefix;
}

function resolveRunTimeCardPath(wo) {
  const audience = wo.opprrc_output.audience || 'BOARD-INTERNAL';
  const chain = OUTPUT_MAP.run_time_card_path[audience] || OUTPUT_MAP.run_time_card_path['BOARD-INTERNAL'];
  return path.join(BASE, chain);
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

// ─── STAGE 1: INTAKE ─────────────────────────────────────────────────────────

async function stageIntake() {
  log('INTAKE', '── STAGE 1: Scanning INBOX folders ──');
  const found = [];

  for (const type of ['internal', 'external']) {
    const items = scanInbox(type);
    log('INTAKE', `  ${type.toUpperCase()}/INBOX: ${items.length} work orders found`);

    for (const { file, path: filePath } of items) {
      try {
        const wo = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!wo.wo_id || !wo.work_order?.title) {
          log('INTAKE', `  ⚠️  ${file} — missing wo_id or title, skipping`);
          continue;
        }

        // Validate required fields
        const required = ['wo_id', 'request_type', 'stage', 'work_order', 'routing', 'opprrc_output'];
        const missing = required.filter(k => !wo[k]);
        if (missing.length > 0) {
          log('INTAKE', `  ❌ ${file} — missing fields: ${missing.join(', ')}`);
          continue;
        }

        // Move to QUEUED
        const queuedDir = path.join(WO_ROOT, 'PROCESSING', 'QUEUED');
        const dest = path.join(queuedDir, file);
        fs.copyFileSync(filePath, dest);
        fs.unlinkSync(filePath);

        log('INTAKE', `  ✅ ${wo.wo_id} → QUEUED  ("${wo.work_order.title}")`);
        found.push({ file, wo, queuedPath: dest });

      } catch (e) {
        log('INTAKE', `  ❌ ${file} — parse error: ${e.message}`);
      }
    }
  }

  log('INTAKE', `── Stage 1 complete: ${found.length} WOs queued ──`);
  return found;
}

// ─── STAGE 2: EVALS ──────────────────────────────────────────────────────────

async function stageEval(woOrPath) {
  const wo = typeof woOrPath === 'string'
    ? JSON.parse(fs.readFileSync(woOrPath, 'utf8'))
    : woOrPath;

  log('EVAL', `── STAGE 2: Evaluating ${wo.wo_id} ──`);

  const profileName = wo.eval?.scoring_weights || 'default';
  const profile = SCORING_WEIGHTS.profiles[profileName] || SCORING_WEIGHTS.profiles.default;
  const criteriaIds = wo.eval?.success_criteria_ids || ['quality_gate_basic', 'delivery_path_valid'];
  const minScore = wo.eval?.min_score_to_promote || 0.82;

  log('EVAL', `  Profile: ${profileName} | Criteria: ${criteriaIds.join(', ')}`);

  // Evaluate each criterion (filesystem checks; agent eval checks logged as pending for agents)
  const results = {};
  for (const cId of criteriaIds) {
    const criterion = SUCCESS_CRITERIA.criteria[cId];
    if (!criterion) {
      results[cId] = { status: 'UNKNOWN', score: 0, note: 'Criterion not found in registry' };
      continue;
    }

    if (criterion.check_type === 'filesystem') {
      // Check if output path exists (pre-run: always not yet written → pending)
      results[cId] = { status: 'PENDING', score: 0, note: 'Will be checked post-agent-run', weight: criterion.weight_contribution };
    } else if (criterion.check_type === 'paperclip_api') {
      results[cId] = { status: 'PENDING', score: 0, note: 'Checked post-HITL approval', weight: criterion.weight_contribution };
    } else {
      // agent_eval: logged as pending (agent evaluates against its own output)
      results[cId] = { status: 'PENDING_AGENT', score: 0, note: criterion.eval_prompt?.slice(0, 80), weight: criterion.weight_contribution };
    }
  }

  const evalResult = {
    wo_id: wo.wo_id,
    profile: profileName,
    criteria_results: results,
    min_score: minScore,
    pre_run_status: 'STAGED_FOR_RUN',
    created_at: new Date().toISOString(),
  };

  // Write eval result to EVALS/RESULTS/
  const resultsDir = path.join(WO_ROOT, 'EVALS', 'RESULTS');
  const resultFile = path.join(resultsDir, `${wo.wo_id}-EVAL.json`);
  fs.writeFileSync(resultFile, JSON.stringify(evalResult, null, 2));
  log('EVAL', `  📊 Eval result written → ${resultFile}`);

  // Move WO to RUNNING
  const runningDir = path.join(WO_ROOT, 'PROCESSING', 'RUNNING');
  const stageName = wo._test ? `_SIM_` : '';
  const runningPath = path.join(runningDir, `${wo.wo_id}${stageName}.json`);

  log('EVAL', `  ✅ ${wo.wo_id} staged for agentic run  (min_score=${minScore})`);
  return { wo, evalResult, runningPath };
}

// ─── STAGE 3: AGENTIC RUN ────────────────────────────────────────────────────

async function stageAgenticRun(wo, evalResult) {
  log('AGENT', `── STAGE 3: Creating Paperclip issue for ${wo.wo_id} ──`);

  const isSim = wo.stage === 'sim' || wo._test;
  const outputPath = resolveOutputPath(wo);
  const runTimeCardPath = resolveRunTimeCardPath(wo);
  const criteriaJson = JSON.stringify(wo.eval?.success_criteria_ids || [], null, 2);
  const weightsProfile = wo.eval?.scoring_weights || 'default';
  const hitlNote = wo.routing?.hitl_required_before_delivery
    ? '\n\n> ⚠️ **HITL REQUIRED**: Create a Paperclip approval request BEFORE writing the deliverable to the CLIENTS-EXTERNAL folder. Tag board for review.'
    : '';

  const issueTitle = `[${isSim ? 'SIM' : 'LIVE'}] ${wo.wo_id} — ${wo.work_order.title}`;
  const issueDescription = `## Work Order: ${wo.wo_id}
**Type:** ${wo.request_type.toUpperCase()} | **Priority:** ${wo.work_order.priority} | **Stage:** ${isSim ? '🧪 SIM' : '🟢 LIVE'}
**Requestor:** ${wo.requestor.agent_or_user || wo.requestor.partner_name}
**Deadline:** ${wo.work_order.deadline_iso}${hitlNote}

---

## Task Instructions

${wo.work_order.description}

---

## Deliverable Requirements

- **Type:** \`${wo.work_order.deliverable_type}\`
- **Output path:** \`${outputPath}\`
- **Filename:** \`${wo.opprrc_output.filename_pattern?.replace('{date}', new Date().toISOString().slice(0,10)).replace('{wo_id}', wo.wo_id).replace('{slug}', slugify(wo.work_order.title))}\`
${wo.opprrc_output.also_write_to_partner_folder ? `- **Also copy to partner folder:** \`${wo.opprrc_output.also_write_to_partner_folder}\`` : ''}

---

## Eval Success Criteria

Scoring profile: \`${weightsProfile}\`
All criteria must pass for this WO to be promoted to LIVE:

\`\`\`json
${criteriaJson}
\`\`\`

**Minimum score to promote:** ${wo.eval?.min_score_to_promote || 0.82}

---

## Run Time Card (REQUIRED)

After completing the deliverable, write a run time card to:
\`${runTimeCardPath}\\${wo.wo_id}-RUN-TIME-CARD.json\`

Run time card format:
\`\`\`json
{
  "wo_id": "${wo.wo_id}",
  "agent_id": "PAPERCLIP_AGENT_ID",
  "agent_name": "YOUR_NAME",
  "run_id": "PAPERCLIP_RUN_ID",
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
  "notes": ""
}
\`\`\`

---

## AMX Chain Traceability

This work order is tracked on the AMX chain via Paperclip activity log.
- **WO ID:** \`${wo.wo_id}\`
- **Submitted at:** ${wo.submitted_at}
- **All PATCH/POST actions MUST include X-Paperclip-Run-Id header**

When complete, post a final comment on this issue with:
1. ✅ Deliverable path confirmed
2. ✅ Run time card path confirmed
3. Eval self-score (0.0–1.0)
4. Criteria passed / failed summary
`;

  // Create the Paperclip issue
  // Treat placeholder/fake UUIDs (ending in all zeros or containing 0000-0000) as null
  const rawProjectId = wo.routing?.project_id || null;
  const isFakeProjId = !rawProjectId || /0{8,}$/.test(rawProjectId) || rawProjectId.includes('0000-0000');
  const projectId = isFakeProjId ? null : rawProjectId;
  const priority = wo.work_order.priority === 'critical' ? 'urgent' : wo.work_order.priority;

  let issue;
  try {
    issue = await api('POST', `/companies/${AMX_COMPANY_ID}/issues`, {
      title: issueTitle,
      description: issueDescription,
      priority: ['urgent', 'high', 'medium', 'low'].includes(priority) ? priority : 'medium',
      projectId: projectId || null,
      labels: [`work-order`, wo.request_type, wo.work_order.deliverable_type, isSim ? 'sim' : 'live'],
    });
    log('AGENT', `  ✅ Issue created: ${issue.identifier} — "${issueTitle}"`);
  } catch (e) {
    log('AGENT', `  ⚠️  Issue create failed: ${e.message} — continuing with dry-run ID`);
    issue = { id: `dry-run-${wo.wo_id}`, identifier: `DRY-${wo.wo_id}`, title: issueTitle };
  }

  // Assign to preferred agent (look up by name)
  const preferredNames = wo.routing?.preferred_agents || [];
  if (preferredNames.length > 0 && issue.id && !issue.id.startsWith('dry-run')) {
    try {
      const agents = await api('GET', `/companies/${AMX_COMPANY_ID}/agents?limit=100`);
      const agentList = Array.isArray(agents) ? agents : (agents.agents || []);
      const match = agentList.find(a => preferredNames.some(n => a.name === n || a.name.includes(n)));
      if (match) {
        await api('PATCH', `/issues/${issue.id}`, { assigneeAgentId: match.id });
        log('AGENT', `  👤 Assigned to: ${match.name} (${match.id.slice(0,8)})`);
      } else {
        log('AGENT', `  ⚠️  No matching agent for: ${preferredNames.join(', ')}`);
      }
    } catch (e) {
      log('AGENT', `  ⚠️  Assignment failed: ${e.message}`);
    }
  }

  // Write the WO to RUNNING with issue reference
  const runningDir = path.join(WO_ROOT, 'PROCESSING', 'RUNNING');
  const enhanced = { ...wo, _paperclip_issue_id: issue.id, _paperclip_issue_identifier: issue.identifier, _pipeline_started_at: new Date().toISOString() };
  fs.writeFileSync(path.join(runningDir, `${wo.wo_id}.json`), JSON.stringify(enhanced, null, 2));

  log('AGENT', `  📋 Issue: ${issue.identifier} | WO saved to RUNNING/`);
  return { wo, issue };
}

// ─── STAGE 4: OUTPUT — AMX CHAIN + RUN TIME CARD ─────────────────────────────

async function stageOutput(woId) {
  log('OUTPUT', `── STAGE 4: Chain verification for ${woId} ──`);

  // Find the WO in RUNNING
  const runningDir = path.join(WO_ROOT, 'PROCESSING', 'RUNNING');
  const woFile = path.join(runningDir, `${woId}.json`);
  if (!fs.existsSync(woFile)) {
    log('OUTPUT', `  ❌ WO ${woId} not found in RUNNING/`);
    return;
  }
  const wo = JSON.parse(fs.readFileSync(woFile, 'utf8'));
  const issueId = wo._paperclip_issue_id;

  // Check if run time card exists
  const rtcPath = resolveRunTimeCardPath(wo);
  const rtcFile = path.join(rtcPath, `${woId}-RUN-TIME-CARD.json`);
  const rtcExists = fs.existsSync(rtcFile);
  log('OUTPUT', `  Run time card: ${rtcExists ? '✅ found' : '❌ NOT YET WRITTEN'} → ${rtcFile}`);

  // Check if deliverable exists
  const outputPath = resolveOutputPath(wo);
  const delivFiles = fs.existsSync(outputPath)
    ? fs.readdirSync(outputPath).filter(f => f.includes(woId))
    : [];
  log('OUTPUT', `  Deliverable files in output path: ${delivFiles.length > 0 ? delivFiles.join(', ') : '❌ none found'}`);

  // Fetch activity log from Paperclip (AMX chain)
  let chainEntries = [];
  if (issueId && !issueId.startsWith('dry-run')) {
    try {
      const activity = await api('GET', `/issues/${issueId}/activity`).catch(() => null);
      chainEntries = activity?.entries || activity || [];
      log('OUTPUT', `  AMX chain entries: ${chainEntries.length} activity log events`);
    } catch { }
  }

  // Write chain receipt
  const chainDir = resolveRunTimeCardPath(wo);
  fs.mkdirSync(chainDir, { recursive: true });
  const receipt = {
    wo_id: woId,
    paperclip_issue_id: issueId,
    paperclip_identifier: wo._paperclip_issue_identifier,
    stage: wo.stage,
    run_time_card_written: rtcExists,
    deliverable_files: delivFiles,
    chain_entries_count: chainEntries.length,
    verified_at: new Date().toISOString(),
    status: rtcExists && delivFiles.length > 0 ? 'COMPLETE' : 'PENDING',
  };
  fs.writeFileSync(path.join(chainDir, `${woId}-CHAIN-RECEIPT.json`), JSON.stringify(receipt, null, 2));
  log('OUTPUT', `  📜 Chain receipt written → ${woId}-CHAIN-RECEIPT.json`);

  if (receipt.status === 'COMPLETE') {
    // Auto-register deliverable in Paperclip Briefcase
    if (issueId && !issueId.startsWith('dry-run') && delivFiles.length > 0) {
      try {
        const rtcData = rtcExists ? JSON.parse(fs.readFileSync(rtcFile, 'utf8')) : {};
        const isExternal = (wo.opprrc_output?.audience || '').includes('EXTERNAL');
        const reviewState = (wo.routing?.hitl_required_before_delivery || isExternal)
          ? 'needs_board_review' : 'none';
        await api('POST', `/issues/${issueId}/work-products`, {
          type: 'document',
          provider: 'opprrc-drive',
          externalId: `opprrc:${wo.opprrc_output?.section || '05_REPORTS'}/${wo.opprrc_output?.audience || 'BOARD-INTERNAL'}/${delivFiles[0]}`,
          title: wo.work_order?.title || delivFiles[0],
          url: driveFolderUrl(wo),
          status: 'ready_for_review',
          reviewState,
          isPrimary: true,
          healthStatus: 'healthy',
          summary: wo.work_order?.description?.slice(0, 300) || '',
          metadata: {
            wo_id: woId,
            stage: wo.stage,
            opprrc_section: wo.opprrc_output?.section,
            audience: wo.opprrc_output?.audience,
            eval_score: rtcData.eval_score || null,
            deliverable_file: delivFiles[0],
          },
        });
        log('OUTPUT', `  📎 Deliverable registered in Paperclip Briefcase (reviewState: ${reviewState})`);
      } catch (e) {
        log('OUTPUT', `  ⚠️  Briefcase registration failed: ${e.message}`);
      }
    }

    // Move to COMPLETE
    const completeDir = path.join(WO_ROOT, 'PROCESSING', 'COMPLETE');
    fs.copyFileSync(woFile, path.join(completeDir, `${woId}.json`));
    fs.unlinkSync(woFile);
    log('OUTPUT', `  ✅ WO ${woId} → COMPLETE`);
  } else {
    log('OUTPUT', `  ⏳ WO ${woId} still RUNNING (deliverable or run time card missing)`);
  }

  return receipt;
}

// ─── STAGE 4b: PROMOTE SIM → LIVE ────────────────────────────────────────────

async function stagePromote(woId) {
  log('PROMOTE', `── Promoting ${woId}: SIM → LIVE ──`);

  // Find in COMPLETE or RUNNING
  let woFile = path.join(WO_ROOT, 'PROCESSING', 'COMPLETE', `${woId}.json`);
  if (!fs.existsSync(woFile)) woFile = path.join(WO_ROOT, 'PROCESSING', 'RUNNING', `${woId}.json`);
  if (!fs.existsSync(woFile)) { log('PROMOTE', `  ❌ ${woId} not found`); return; }

  const wo = JSON.parse(fs.readFileSync(woFile, 'utf8'));
  if (wo.stage !== 'sim') { log('PROMOTE', `  ⚠️  Already ${wo.stage} — no promotion needed`); return; }

  // Check eval result
  const evalFile = path.join(WO_ROOT, 'EVALS', 'RESULTS', `${woId}-EVAL.json`);
  if (fs.existsSync(evalFile)) {
    const eval_ = JSON.parse(fs.readFileSync(evalFile, 'utf8'));
    if (eval_.final_score !== undefined && eval_.final_score < (wo.eval?.min_score_to_promote || 0.82)) {
      log('PROMOTE', `  ❌ Score ${eval_.final_score} < min ${wo.eval?.min_score_to_promote} — NOT promoting`);
      return;
    }
    if (wo.eval?.requires_manual_promotion) {
      log('PROMOTE', `  ⚠️  ${woId} requires manual promotion (external WO). Set requires_manual_promotion=false after board review.`);
      return;
    }
  }

  // Create LIVE version
  const liveWo = { ...wo, stage: 'live', _promoted_from_sim: woId, _promoted_at: new Date().toISOString() };
  delete liveWo._test;
  delete liveWo._test_expected_score;
  delete liveWo._test_stage;
  delete liveWo._paperclip_issue_id;
  delete liveWo._paperclip_issue_identifier;

  const liveDir = path.join(BASE, '09_DEPLOYMENTS', 'AMX-LABS-LIVE');
  fs.writeFileSync(path.join(liveDir, `${woId}-LIVE.json`), JSON.stringify(liveWo, null, 2));

  // Create live Paperclip issue
  const { issue } = await stageAgenticRun(liveWo, null);
  log('PROMOTE', `  🟢 LIVE issue: ${issue.identifier}`);
  log('PROMOTE', `  ✅ ${woId} promoted to LIVE — sim data archived`);
}

// ─── PIPELINE STATUS ─────────────────────────────────────────────────────────

function pipelineStatus() {
  const dirs = { QUEUED: 0, RUNNING: 0, COMPLETE: 0, FAILED: 0 };
  for (const stage of Object.keys(dirs)) {
    const d = path.join(WO_ROOT, 'PROCESSING', stage);
    if (fs.existsSync(d)) dirs[stage] = fs.readdirSync(d).filter(f => f.endsWith('.json')).length;
  }
  const evalResults = fs.existsSync(path.join(WO_ROOT, 'EVALS', 'RESULTS'))
    ? fs.readdirSync(path.join(WO_ROOT, 'EVALS', 'RESULTS')).length
    : 0;
  const liveDir = path.join(BASE, '09_DEPLOYMENTS', 'AMX-LABS-LIVE');
  const liveCount = fs.existsSync(liveDir) ? fs.readdirSync(liveDir).filter(f => f.endsWith('.json')).length : 0;
  const simDir = path.join(BASE, '09_DEPLOYMENTS', 'AMX-LABS-SIM');
  const simCount = fs.existsSync(simDir) ? fs.readdirSync(simDir).filter(f => f.endsWith('.json')).length : 0;

  console.log(`
╔═══════════════════════════════════════════════════╗
║       AMX WORK ORDER PIPELINE — STATUS            ║
╠═══════════════════════════════════════════════════╣
║  STAGE 1: INTAKE                                  ║
║    Internal INBOX:  ${scanInbox('internal').length.toString().padEnd(3)} WOs waiting              ║
║    External INBOX:  ${scanInbox('external').length.toString().padEnd(3)} WOs waiting              ║
╠═══════════════════════════════════════════════════╣
║  STAGE 2: EVALS                                   ║
║    Eval results:    ${evalResults.toString().padEnd(3)} processed                   ║
╠═══════════════════════════════════════════════════╣
║  STAGE 3: AGENTIC                                 ║
║    Queued:          ${dirs.QUEUED.toString().padEnd(3)} WOs                         ║
║    Running:         ${dirs.RUNNING.toString().padEnd(3)} WOs                         ║
╠═══════════════════════════════════════════════════╣
║  STAGE 4: OUTPUT                                  ║
║    Complete:        ${dirs.COMPLETE.toString().padEnd(3)} WOs                         ║
║    Failed:          ${dirs.FAILED.toString().padEnd(3)} WOs                         ║
╠═══════════════════════════════════════════════════╣
║  DEPLOYMENTS                                      ║
║    SIM archived:    ${simCount.toString().padEnd(3)} WOs                         ║
║    LIVE deployed:   ${liveCount.toString().padEnd(3)} WOs                         ║
╚═══════════════════════════════════════════════════╝`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const [,, cmd, arg] = process.argv;

if (!cmd || cmd === 'status') {
  pipelineStatus();
} else if (cmd === 'intake') {
  const queued = await stageIntake();
  for (const { wo } of queued) {
    const { evalResult } = await stageEval(wo);
    await stageAgenticRun(wo, evalResult);
  }
  pipelineStatus();
} else if (cmd === 'eval') {
  if (!arg) { console.error('Usage: wo-pipeline.mjs eval <path-to-wo.json>'); process.exit(1); }
  await stageEval(arg);
} else if (cmd === 'run') {
  if (!arg) { console.error('Usage: wo-pipeline.mjs run <path-to-wo.json>'); process.exit(1); }
  const wo = JSON.parse(fs.readFileSync(arg, 'utf8'));
  const { evalResult } = await stageEval(wo);
  await stageAgenticRun(wo, evalResult);
} else if (cmd === 'output' || cmd === 'chain') {
  if (!arg) { console.error('Usage: wo-pipeline.mjs chain <WO-ID>'); process.exit(1); }
  await stageOutput(arg);
} else if (cmd === 'promote') {
  if (!arg) { console.error('Usage: wo-pipeline.mjs promote <WO-ID>'); process.exit(1); }
  await stagePromote(arg);
} else if (cmd === 'sim') {
  // Run all 3 sim test datasets through the full pipeline
  log('SIM', '── Running all SIM test datasets ──');
  const simDir = path.join(WO_ROOT, 'EVALS', 'TEST_DATASETS', 'SIM');
  const simFiles = fs.readdirSync(simDir).filter(f => f.endsWith('.json'));
  for (const file of simFiles) {
    log('SIM', `Processing: ${file}`);
    const wo = JSON.parse(fs.readFileSync(path.join(simDir, file), 'utf8'));
    const { evalResult } = await stageEval(wo);
    await stageAgenticRun(wo, evalResult);
  }
  pipelineStatus();
} else {
  console.error(`Unknown command: ${cmd}. Use: status | intake | eval | run | chain | promote | sim`);
  process.exit(1);
}

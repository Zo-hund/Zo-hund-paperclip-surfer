# Troubleshooting Guide

Common issues, causes, and solutions for the work order pipeline.

## Stage 1: Intake Errors

### Error: "Invalid JSON syntax"

**Cause:** The JSON file has a syntax error (missing comma, unclosed bracket, etc).

**Solution:**
1. Copy the JSON to a JSON validator: https://jsonlint.com/
2. Fix the syntax errors reported
3. Save the corrected file
4. Re-run: `node scripts/wo-pipeline.mjs intake`

**Example errors:**
- `Unexpected token }` — Extra comma before closing brace
- `Unexpected token "` — Unclosed string or mismatched quotes
- `Unexpected token ,` — Comma in wrong place

---

### Error: "Missing required field: X"

**Cause:** A required field is missing from the work order JSON.

**Solution:**
1. Check the [QUICK-START](QUICK-START-WORK-ORDERS.md#field-explanations) field table
2. Add the missing field to your WO JSON
3. Re-run intake

**Example:**
```json
{
  // Missing 'deadline_iso' field
  "wo_id": "WO-2026-001",
  "work_order": {
    "title": "Report",
    "description": "...",
    "deliverable_type": "report",
    "priority": "high"
    // ← deadline_iso missing!
  }
}
```

**Fix:** Add `"deadline_iso": "2026-04-28T17:00:00Z"`

---

### Error: "Invalid project_id"

**Cause:** The `routing.project_id` doesn't exist in Paperclip.

**Solution:**
1. Open Paperclip UI (usually `http://localhost:3100`)
2. Navigate to **Projects**
3. Find your project
4. Copy the correct project UUID
5. Update `routing.project_id` in your WO
6. Re-run intake

**Common issue:** Using a project *name* instead of *ID*:
```json
{
  "routing": {
    "project_id": "My Project"  // ✗ Wrong (this is the name)
  }
}

// Fix:
{
  "routing": {
    "project_id": "d1234567-1234-5678-9abc-def012345678"  // ✓ Correct (UUID)
  }
}
```

---

### Error: "Invalid deadline_iso"

**Cause:** The deadline is not in ISO 8601 format or is in the past.

**Solution:**
1. Use format: `YYYY-MM-DDTHH:MM:SSZ`
2. Ensure the date is in the future
3. Example valid format: `2026-04-28T17:00:00Z`

**Examples:**
```json
// ✗ Wrong
"deadline_iso": "4/28/2026"
"deadline_iso": "2026-04-28"
"deadline_iso": "April 28, 2026"

// ✓ Correct
"deadline_iso": "2026-04-28T17:00:00Z"
"deadline_iso": "2026-04-28T17:00:00-05:00"
```

---

### Error: "File not valid UTF-8"

**Cause:** The JSON file is saved in a different encoding (e.g., ANSI, Latin1, UTF-16).

**Solution:**
1. Open the file in a text editor (e.g., VS Code, Notepad++)
2. Change the encoding to UTF-8
3. Save the file
4. Re-run intake

**In VS Code:**
- Bottom right of window, click encoding selector
- Select "UTF-8"
- Save file

---

## Stage 2: Evaluation Errors

### Error: "Success criteria not found"

**Cause:** A criterion in `eval.success_criteria_ids` doesn't exist in the success criteria registry.

**Solution:**
1. Check `EVALS/SCORING/SUCCESS_CRITERIA.json`
2. Use only criteria that exist in that file
3. Re-run eval

**Example:**
```json
{
  "eval": {
    "success_criteria_ids": ["completeness", "accuracy", "my_nonexistent_criterion"]
    // ✗ "my_nonexistent_criterion" doesn't exist
  }
}
```

**Fix:** Use only criteria from the registry file.

---

### Error: "Scoring weights profile not found"

**Cause:** The `eval.scoring_weights` profile doesn't exist.

**Solution:**
1. Check `EVALS/SCORING/SCORING_WEIGHTS.json`
2. Use a profile that exists (e.g., "default", "external_strict")
3. Re-run eval

---

### Error: "Eval score below threshold"

**Cause:** Work order didn't meet the `min_score_to_promote` threshold.

**Solution:**
1. Check the eval result in `EVALS/RESULTS/WO-{wo_id}-eval.json`
2. See which criteria failed
3. Options:
   - **Fix the WO:** Re-submit with better description/details
   - **Lower the threshold:** Change `eval.min_score_to_promote` to a lower value
   - **Adjust criteria:** Modify `eval.success_criteria_ids` to only include realistic criteria
4. Re-run eval

**Example:**
```json
{
  "wo_id": "WO-2026-001",
  "score": 0.65,
  "min_threshold": 0.75,
  "criteria_passed": ["completeness"],
  "criteria_failed": ["accuracy", "timeliness"]
}
```

**Solution:** Lower threshold to 0.60 or fix the WO description.

---

## Stage 3: Agentic Errors

### Error: "Agent not found"

**Cause:** A preferred agent name doesn't exist in Paperclip.

**Solution:**
1. Run: `node scripts/wo-pipeline.mjs status` to see assigned agent
2. Open Paperclip UI and check agent names
3. Update `routing.preferred_agents` with correct agent names
4. Re-run agentic

**Example:**
```json
{
  "routing": {
    "preferred_agents": ["CEO", "NonExistentAgent"]
    // ✗ "NonExistentAgent" doesn't exist
  }
}
```

**Fix:** Use real agent names from Paperclip.

---

### Error: "No agent available"

**Cause:** All preferred agents are paused or busy (budget exhausted, paused manually, etc.).

**Solution:**
1. Check agent status in Paperclip UI
2. Check agent budgets (monthly cost limit)
3. Options:
   - Resume paused agent
   - Increase agent's monthly budget
   - Add more agents to `preferred_agents` list
   - Wait for agents to become available again

**Example:**
```json
{
  "routing": {
    "preferred_agents": ["CMO"]  // CMO is paused (budget exhausted)
  }
}
```

**Fix:**
- Add fallback agents: `["CMO", "CEO", "CFO"]`
- Or increase CMO's budget in Paperclip

---

### Error: "Issue creation failed (500)"

**Cause:** Paperclip API error. Usually a validation issue on the Paperclip side.

**Solution:**
1. Check if Paperclip is running: `http://localhost:3100`
2. Check if the project still exists (might have been deleted)
3. Verify all required fields in the request
4. Check Paperclip logs for detailed error
5. Try again: `node scripts/wo-pipeline.mjs agentic`

**Common causes:**
- Project doesn't exist
- Paperclip API is down
- Network connectivity issue

---

## Stage 4: Output Errors

### Error: "Deliverable not found"

**Cause:** The agent didn't write the file to the expected location, or it's in the wrong folder.

**Solution:**
1. Check if agent actually completed the work (in Paperclip, is issue marked closed?)
2. Check the correct deliverable path in the run time card
3. Verify agent has write permissions to the output folder
4. Check Google Drive for the file manually
5. If file is in wrong location, manually move it to correct path
6. Re-run output stage: `node scripts/wo-pipeline.mjs output`

**Common issues:**
- Agent saved to wrong folder
- File has different name than expected
- Permission denied on output folder

---

### Error: "Run time card missing"

**Cause:** Agent completed work but didn't write run time card to Paperclip.

**Solution:**
1. Verify agent actually completed the work (issue status = closed)
2. Manually create a run time card JSON (see [SCHEMAS](SCHEMAS-AND-FORMATS.md#run-time-card-schema))
3. Place it in the Paperclip issue metadata
4. Re-run output: `node scripts/wo-pipeline.mjs output`

---

## General Issues

### Issue: Pipeline is very slow

**Causes:**
- Many WOs in INBOX (scanning takes time)
- Paperclip API is slow
- Google Drive API is slow
- Network connectivity issues

**Solutions:**
1. Process WOs in smaller batches
2. Check Paperclip health: `curl http://localhost:3100/health`
3. Check network: `ping api.google.com`
4. Monitor logs: `DEBUG=* node scripts/wo-pipeline.mjs intake`

---

### Issue: Paperclip API returns "Unauthorized"

**Cause:** Bearer token is invalid or expired.

**Solution:**
1. Check `.env` file for `PAPERCLIP_BOARD_TOKEN`
2. Verify token value is correct
3. If token expired, get a new one from Paperclip admin
4. Update `.env` and restart

---

### Issue: Google Drive access denied

**Cause:** No permission to read/write to AMX-LABS folder.

**Solution:**
1. Open Google Drive and manually navigate to the folder
2. Check you have edit permissions
3. Request access if needed
4. Verify `GOOGLE_DRIVE_BASE_PATH` env var is correct
5. Test by manually creating a file in the folder

---

### Issue: WO stuck in QUEUED folder

**Cause:** Eval stage hasn't run, or there's an eval error.

**Solution:**
1. Check if eval stage completed: `node scripts/wo-pipeline.mjs status`
2. Check for errors in `PROCESSING/FAILED/`
3. Check eval result in `EVALS/RESULTS/WO-{wo_id}-eval.json`
4. If no eval result, run: `node scripts/wo-pipeline.mjs eval`

---

### Issue: WO stuck in RUNNING folder

**Cause:** Either waiting for agent assignment (agentic) or agent is still working.

**Solution:**
1. Check issue status in Paperclip
   - If open/in_progress → agent is still working (wait)
   - If closed → agent finished (run output stage)
2. Run output stage: `node scripts/wo-pipeline.mjs output`
3. If still stuck, check agent status in Paperclip

---

## Debugging Techniques

### Enable Debug Logs

Add `DEBUG=*` to see detailed execution logs:

```bash
DEBUG=* node scripts/wo-pipeline.mjs intake
DEBUG=* node scripts/wo-pipeline.mjs eval
DEBUG=* node scripts/wo-pipeline.mjs agentic
DEBUG=* node scripts/wo-pipeline.mjs output
```

### Check File Manually

```bash
# View WO file
cat PROCESSING/RUNNING/WO-2026-001.json

# Check eval result
cat EVALS/RESULTS/WO-2026-001-eval.json

# View error (if any)
cat PROCESSING/FAILED/WO-2026-001-error.json
```

### Check Paperclip Directly

```bash
# List issues in project
curl "http://localhost:3100/api/issues?projectId=d1234567..." \
  -H "Authorization: Bearer {token}"

# Get specific issue
curl "http://localhost:3100/api/issues/AMXA-2287" \
  -H "Authorization: Bearer {token}"

# Check agents
curl "http://localhost:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/agents" \
  -H "Authorization: Bearer {token}"
```

### Re-run a Single Stage

If one stage fails, fix the issue and re-run just that stage:

```bash
# Intake failed? Fix WOs and re-run
node scripts/wo-pipeline.mjs intake

# Eval failed? Check criteria and re-run
node scripts/wo-pipeline.mjs eval

# Re-do agent assignment
node scripts/wo-pipeline.mjs agentic

# Verify outputs
node scripts/wo-pipeline.mjs output
```

### Manual Recovery

If a WO is stuck, you can manually move it:

```bash
# Move from QUEUED to RUNNING (skip eval)
# ⚠️ Only if you're sure eval passed
mv PROCESSING/QUEUED/WO-2026-001.json PROCESSING/RUNNING/WO-2026-001.json

# Move to COMPLETE (if agent finished but output failed)
mv PROCESSING/RUNNING/WO-2026-001.json PROCESSING/COMPLETE/WO-2026-001.json

# Move to FAILED (if unrecoverable)
mv PROCESSING/RUNNING/WO-2026-001.json PROCESSING/FAILED/WO-2026-001.json
```

---

## Error Quick Reference

| Error | Stage | Check | Fix |
|-------|-------|-------|-----|
| Invalid JSON | Intake | Syntax | Use JSON validator |
| Missing field | Intake | Schema | Add required field |
| Invalid project_id | Intake | Paperclip | Get correct UUID |
| Invalid deadline | Intake | Format | Use ISO 8601 |
| Criteria not found | Eval | Registry | Check SUCCESS_CRITERIA.json |
| Weights not found | Eval | Weights | Check SCORING_WEIGHTS.json |
| Score too low | Eval | Threshold | Lower min or improve WO |
| Agent not found | Agentic | Roster | Check Paperclip agents |
| Agent unavailable | Agentic | Status | Increase budget or use others |
| Issue creation failed | Agentic | API | Check Paperclip status |
| Deliverable not found | Output | Path | Check agent output |
| RTC missing | Output | Agent | Create manually |
| API unauthorized | Any | Token | Verify PAPERCLIP_BOARD_TOKEN |
| GDrive denied | Any | Permissions | Request or fix path |

---

## When All Else Fails

1. **Check logs:** `DEBUG=* node scripts/wo-pipeline.mjs [stage]`
2. **Verify Paperclip:** Is it running? `curl http://localhost:3100/health`
3. **Verify GDrive:** Can you manually access the AMX-LABS folder?
4. **Check envvars:** `.env` file has correct values?
5. **Restart Paperclip:** `pkill -f "paperclip|Paperclip"`
6. **Contact admin:** If Paperclip or GDrive is broken

---

## Next Steps

- **Environment setup issue?** See [CONFIGURATION](CONFIGURATION.md)
- **API issue?** See [API-REFERENCE](API-REFERENCE.md)
- **Process flow issue?** See [OPERATOR-GUIDE](OPERATOR-GUIDE.md)

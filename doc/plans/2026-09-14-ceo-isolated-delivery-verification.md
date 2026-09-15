# Isolated CEO delivery verification

## Result

**Delivery persisted, but the heartbeat did not finish successfully.** The repaired adapter executed the normal heartbeat workflow in a disposable VPS fixture: it wrote a readable document, registered its primary Briefcase work product, and changed the issue to `in_review`. It subsequently attempted a memory write with malformed shell quoting and an incorrect project identifier. The adapter correctly reported that tool failure with exit code 1. This is partial functionality evidence, not a completed successful run or release approval.

No production container, image, mounts, credentials, task, company or process was changed. Its container identity and image were unchanged afterward and its health remained `healthy`. The disposable fixture container and named data volume were removed.

## Isolation and source identity

- Preflight: 235 GB filesystem space available; approximately 28 GB memory available. Production initially healthy.
- Exact running image ID: `sha256:c2de37cbace812c244aeee37d67ac782ed7913e96f44f68a90f56a7e2ba4b26c`.
- Disposable container used that image with a read-only overlay of the candidate's compiled OpenRouter adapter. The remaining server/runtime came from the old production image, so this does not validate the complete new candidate image.
- The image's development exports originally pointed at TypeScript source. A test-only, read-only package manifest redirected exports to compiled files. Actual resolver output, checked before inference: `file:///app/packages/adapters/openrouter/dist/server/index.js`.
- Container SHA256 of compiled `execute.js`: `899b65ad50902c61505b970e7a6caf6c8db108567f6d8c52b33967cf939e765c`.
- Container SHA256 of compiled `task-context.js`: `c9a44d2d93b6c7ebbe866c4059dc777a6fc522ba347d49a88cbd3dcbf001ab9d`.
- Fresh embedded PostgreSQL/data in a disposable volume, no production mounts or Docker socket, no published ports, local-trusted API bound to loopback inside the container. Control requests used `docker exec`; this does not validate public authenticated routing.
- Scheduler disabled; one CPU, 2 GB RAM, 256 PIDs, capabilities dropped, no-new-privileges. One exact synthetic company received billing and host-tool grants. No real client records were copied.
- Existing verified OpenRouter credential was transferred only in process environment into the disposable runtime. It was not printed or written to source/report.
- Provider harness pinned the tested interactive model, limited output to 700 tokens/request and allowed up to 20 provider calls; the adapter deadline was 180 seconds. Nine calls occurred. This synthetic task prohibited external communication/research and production access.

## Persisted evidence

Fixture company: `8915d1b5-3f7e-4bf8-9270-761ea0e211f0`.
Fixture CEO: `7aaeb90a-a04e-46e9-94ce-d5398e91961c`.
Issue: `4c215fdd-3645-4288-8a6b-0785b7b3606c`.
Heartbeat: `fa4fcb99-2902-45f3-8900-44ea4e8286a5`.

Readback confirmed:

- Issue status `in_review`.
- Document `82649ad6-5c78-4c16-b734-73bce1138c68`, key `deliverable`, title `Isolated CEO verification`, markdown format, revision 1, attributed to the fixture agent.
- Primary active work product `95b744c4-1350-44c7-bde0-a45e6c1d1b11`, type `document`, provider `agent-sync`, attributed to this heartbeat, pointing at the issue document export URL.
- Work-product review state was `none`; issue review status was confirmed independently.

Readable document content:

```markdown
# Isolated CEO Verification

- Synthetic fixture only
- Local API delivery checked
- No production changes
```

## Authentic timings and usage

Final fixture setup-through-readback interval: September 15, 2026, 03:26:39.646–03:27:40.640 UTC (61 seconds, including two cold starts and cleanup).

Actual heartbeat: 03:27:22.959–03:27:37.317 UTC, **14.358 seconds**.

- Provider requests: 9, all HTTP 200.
- Provider-reported input tokens: 35,320; output tokens: 1,497; total: 36,817. Input counts include repeated conversation context across calls.
- Sum of provider-reported request costs: **USD 0.0040842**.
- Persisted heartbeat usage agrees on input/output totals. Its cached-input field is zero even though provider request records contain cached-token counts; do not treat that persisted field as an accurate cache breakdown.
- Final heartbeat status `failed`, exit code 1, with explicit tool-failure reporting.

An earlier harness attempt mounted only dist while the old package still resolved source. It exercised the old adapter, exhausted its artificial ten-request provider budget, and produced no deliverable. It cost USD 0.0018657. That attempt is not evidence against the repaired adapter; the export mismatch was diagnosed and corrected before the final attempt. Both attempts used disposable data and left production unchanged.

## Remaining repair

After successful delivery/readback, the model attempted an unnecessary memory API write. Its command over-escaped header quotes, causing `curl` to interpret part of a header as a hostname; the API also reported missing agent authentication. It supplied the fixture company ID as a project ID. No successful memory write was established.

The next fix should make post-delivery memory behavior deterministic and correctly scoped, or omit memory writes when there is no valid project. Preserve accurate failure reporting. A clean successful heartbeat still requires another bounded verification after a concrete repair; no additional retry was performed here.

The complete new-image vulnerability scan, authenticated staging, real saved CEO/client task compatibility, recovery evidence and exact-release production approval remain separate gates.


### Source of the unnecessary memory write

`server/src/services/heartbeat.ts:2939-2968` unconditionally generates self-improvement instructions requesting one to three memory writes at the end of every task, even when no memories were loaded. It saves those instructions as `context.paperclipMemoryFilePath` at lines 2973-2975; OpenRouter includes this file in the system prompt. The fixture log confirms memoryCount zero followed by the model's attempted memory entries after its completed-delivery summary. No prior project, stored user instructions, or stale task session was supplied by the fixture.

Minimal recommended correction: retain read-only memory context but make memory mutation opt-in, not mandatory post-task work. Supply only a verified execution project identifier when project-scoped capture is explicitly required; otherwise omit project scope. After requested delivery and readback, let the run terminate. Continue reporting genuine tool failures as failures.

## Implemented memory configuration repair and third fixture

The candidate now uses `server/src/services/agent-runtime/memory-prompt.ts` from heartbeat. Automatic memory-writing instructions require strict boolean `memoryCapture: true` in the saved, operator-owned agent adapter configuration. Missing, false, string, and other truthy values leave capture disabled. Existing saved-memory read context and experiment context remain available unchanged. This intentionally changes the previous default of instructing every run to write memories; operators wanting capture must explicitly enable it. It does not delete or migrate existing memories, nor prohibit separately authorized explicit memory tasks.

For enabled capture, heartbeat verifies the execution project belongs to the agent company before passing its ID. With no verified project, the helper emits global scope and omits `projectId`. It never substitutes a company identifier. Eight focused helper tests pass, and targeted server TypeScript compilation/typecheck passed.

One additional bounded fixture tested default-no-memory behavior on September 15, 2026. It was a **hybrid fixture**, not the deployable candidate image: the unchanged running image plus the verified repaired OpenRouter dist/export overlays and a read-only copy of the old compiled heartbeat with only its unconditional reflection-instruction block replaced by an empty string. This exercises the default branch; enabled capture and project checking are source/test evidence only.

- Original compiled heartbeat SHA-256: `40cc1696e812c5618fb5d22cf65dc53462c26b13ce6704034cd75c3d9c9c40ea`.
- Fixture heartbeat SHA-256: `e00d1d1af9e130a220513d967324cb32c84d54da8ee9b2548e80e0470b08c5b4`.
- Loaded OpenRouter execute SHA-256: `899b65ad50902c61505b970e7a6caf6c8db108567f6d8c52b33967cf939e765c`.
- Loaded task-context SHA-256: `c9a44d2d93b6c7ebbe866c4059dc777a6fc522ba347d49a88cbd3dcbf001ab9d`.
- Confirmed exports resolution: `file:///app/packages/adapters/openrouter/dist/server/index.js`.
- Run ID: `7ef20588-baad-49a1-9818-0ed35ee6656a`.
- Heartbeat: 03:34:02.941–03:34:25.093 UTC, 22.152 seconds.
- Provider: 15 requests within the 20-request ceiling; 55,226 input and 1,720 output tokens, total 56,946; reported cost USD 0.0056391.

**Default memory suppression worked, but delivery failed.** No memory endpoint call appears in the recorded tools. However, the requested issue remained backlog and the deliverable document returned 404. Only an automatic, nonprimary system OPPRRC report with zero resources/projects was registered; that is not the requested deliverable. A local markdown file was written, which also does not satisfy persisted Briefcase delivery.

The model omitted `Content-Type: application/json` from curl mutation calls. The API returned validation errors with an undefined request body. One retry also used an unsupported POST document route. Because curl without failure flags exits zero for HTTP errors, process-success tracking allowed heartbeat status `succeeded` and exit 0, even though the final model response acknowledged repeated validation failures and asked to retry. This is a remaining delivery-contract defect, not a successful end-to-end result.

Recommended next repair: a structured, authenticated Paperclip API operation that serializes JSON, supplies required headers, and reports non-2xx responses as tool failures; additionally verify requested persisted delivery before reporting task completion. Do not infer success from a shell exit or the presence of an autogenerated system report. No further provider run was started. Fixture container and data volume were removed, and production container/image remained unchanged and healthy.

## Native API and persisted-delivery repair

The candidate now exposes `paperclip_api` with structured method/path/body arguments. The server runtime supplies the platform origin, agent token, audit run header and JSON content type. The tool rejects external paths, traversal, redirects, unsupported methods, malformed bodies, non-2xx responses, invalid JSON and responses exceeding 256 KiB. It uses the existing run abort signal. Arbitrary error response bodies and tool arguments are not logged; a reflected runtime token is redacted from successful JSON responses. Shell tools remain available for authorized workspace work, but platform instructions direct every platform operation, including memory, through the native tool.

Before an assigned run can return exit 0, the adapter reads the current authenticated identity, issue ownership/company and in_review/done status, registered active primary work products, and the actual nonempty platform document body. Automatic system reports cannot qualify. Successfully checked-out issues selected during an initially unassigned wake are also verified. Merely read/created child tasks do not become completion obligations. Informational unassigned runs remain supported. This checks persisted artifact existence/readability, not the truth of every claim in its content; acceptance review remains necessary.

Compatibility restriction: external PRs, previews and other non-document artifacts must be accompanied by a primary platform verification document with actual evidence and links. No arbitrary external URL is fetched with runtime credentials, and agent-writable health metadata is not accepted as independent verification. No task status is automatically changed by this verifier.

Focused native API, task context, completion and timeout tests plus the OpenRouter adapter TypeScript build passed after implementation. This source repair has not yet been exercised against a provider in a new isolated run or deployed to production.

## Final bounded native-API verification: passed

One subsequent authorized fixture on September 15, 2026 passed the actual delivery contract. This supersedes the preceding statement about provider verification, but does not change production deployment status. The same isolated old-image server/default-memory-off heartbeat overlay was retained; only the freshly built adapter changed. The fixture operator prompt now explicitly requests the native tool instead of its previous node/curl wording.

Before wakeup, runtime resolution was asserted as `file:///app/packages/adapters/openrouter/dist/server/index.js`, with these loaded SHA-256 values checked against the copied overlay:

- `execute.js`: `ece797f91f64f51d909c02d1943990411526df9ab2485394c5b074d09e702b59`
- `task-context.js`: `b86f33a235de018c3f8769f439a1e344fe0076b583e7f51805c58dcede4108cc`
- `paperclip-api.js`: `b9bdc5b1e50ecf9e779918db60cd3f7b4470dddfec9f0b5820f07a5aac185a23`

Run `294ed16e-b2ef-4c5f-8696-507a324fe788` succeeded with exit code 0 and no error. Actual heartbeat interval was 03:45:25.640–03:45:36.138 UTC: **10.498 seconds**. Setup through cleanup/readback took 03:44:40.149–03:45:40.275 UTC. Provider evidence records nine HTTP-200 requests, 26,034 input tokens plus 651 output tokens, **26,685 total**, and **USD 0.00269250**. The limits remained twenty requests, 700 output tokens per request, 180-second agent timeout, one CPU and 2 GiB RAM.

Persisted issue `ae7e6dcb-ba76-4f7e-bb1b-63bd39e4bc15` is `in_review`. Document `1864940f-ee62-44b9-9666-7560628717cf`, key `deliverable`, contains the requested three fixture bullets and is readable. Primary active `agent-sync` work product `bea42900-3565-4036-a4c1-eef1179c6807` references that document export and records this exact run as its creator. The adapter's independent identity/ownership/status/document readback completed before successful exit. No shell tool call was needed.

This is genuine isolated functionality evidence for the repaired adapter on the old server API, not a candidate image/security/staging approval or a live client-task result. Production container ID/image remained unchanged and healthy. The fixture container and fresh data volume were removed. Provider cache details exist in raw usage, while the old heartbeat cache and session flags are not reliable evidence of session reuse; the fixture agent and data were newly created. Sanitized detailed local result: `F:/AMX-Caches/Temp/amx-ceo-isolated-20260915/native-api-result.json`.

Remaining presentation limitation: the final model prose invented an `https://api.paperclip.com` origin for its document link. The registered work product retained the correct relative platform export URL and actual API readback passed. UI navigation should use the registered URL rather than a generated prose link. One workspace `write_file` call occurred alongside seven native API calls; no shell command was needed.

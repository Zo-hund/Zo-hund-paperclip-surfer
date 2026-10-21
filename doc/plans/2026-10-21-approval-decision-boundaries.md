# Company-bound approval decisions — October 21, 2026

The calendar release preflight found approval decisions that checked only for a board actor before invoking mutating services. A company member could reach another company's approve/reject/revision/escalation handler if given its approval identifier. Hire approval also bypassed the instance-operator authority now required by direct agent-creation routes, and decision attribution trusted a body field instead of the authenticated reviewer.

## Repair

- Each decision loads its approval, preserves missing-target404, checks company access, and requires instance administration for hire decisions before mutation. Ordinary same-company board decisions remain available. The trusted local operator retains its existing authority.
- Persisted decision identity comes from the authenticated actor. The existing input field is accepted for API compatibility but cannot forge another reviewer. A session without a reviewer identity is rejected.
- The approval service validates requester agents, pending hire targets, managers, simulation-run references, deliveries and promotion resources against the approval's company before persistence or execution. Changed resubmission payloads receive the same checks. Completed simulation eligibility is rechecked before promotion decisions and resubmission.
- Delivery, submission, booking and listing updates include the approval's company in their predicates. This protects the later write even if a legacy or resubmitted payload contains a foreign identifier.
- Decision updates compare company, approval type, original payload and eligible status. Revision/escalation/resubmission return409 when a competing decision wins, rather than overwriting it or returning an undefined result. Repeated already-applied approve/reject requests preserve their prior no-op behavior.

## Evidence and limits

Ten local-only baseline router probes failed denial expectations with HTTP200: four cross-company approval actions, five cross-company run actions and one non-admin hire decision. All actual mutation/execution services in those probes were harmless mocks. Baseline evidence remains separately preserved in the security review folder.

This candidate owns only approval route/service changes, related regression fixtures/tests and this note. Run and alternate execution routes in `agents.ts` belong to the separate security-hardening candidate. The calendar and dependency overlays are preserved in this checkout but are excluded from the incremental approval patch.

Validation results and exact hashes are recorded in `APPROVAL-SECURITY-RECEIPT.json` outside this checkout. Focused real-router/service regressions cover foreign references, pending-target requirements, authenticated reviewer attribution, eligible same-company success, idempotent replay and competing decisions. Database calls are mocked with inspected SQL predicates; this is not a live database or image test.

Malformed legacy approvals fail closed, including rejection where it would terminate a foreign/non-pending agent. Operators must reconcile those records through a separate reviewed procedure; the repair does not mutate foreign references to permit rejection. Cross-record ownership is treated as immutable. PostgreSQL concurrency and exact-image authentication must still be validated through the normal release checks.

No review expiry, advisory identity, source-hash gate, workflow, schema, permissions, secret, human approval or live service is changed. This source repair does not renew the expired backport review, sign a release or certify production readiness.

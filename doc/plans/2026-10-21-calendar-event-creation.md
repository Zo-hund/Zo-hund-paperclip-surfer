# Calendar event creation and readback

The calendar page rendered a New Event button without an action and omitted the existing company calendar feed. Operators could neither open a creation form nor see saved company events in that page.

## Behavior

- Open a draft-event form from New Event and use the existing admin-authorized event API.
- Collect a title, start, end and explicit Eastern or UTC time zone. Reject invalid ranges and Eastern daylight-saving gaps or repeated times before submitting.
- Require the created event ID to appear in the company calendar feed before reporting success. Refresh only the selected company's cached feed.
- Retain entries on authorization or validation errors. After a successful create with delayed readback, retry the read only. Block repeated submission when a create outcome is uncertain and require reconciliation.
- Reset the dialog on company changes and prevent late replies from affecting a new company.
- Display feed events in the calendar with the same device time zone used for its day columns and a visible time-zone label.

## Scope

This is a UI repair using existing server contracts. It adds no production dependencies, database migrations or authorization changes. It does not introduce recurring events, project associations, external calendar synchronization or durable server idempotency. The server remains authoritative for company access and admin permissions.

## Validation

The isolated candidate at the deployed source revision passed eight React DOM interaction checks, recursive type checking and the full build. Its full repository test runner stalled; those results are not a full-suite pass. Validation against the current experimental branch and permanent repository tests are recorded in the pull request.

Before a live release, complete the repository's required checks. Then verify the real dialog's focus, Escape handling, mobile viewport, authorization errors, draft save, authenticated feed readback and reload. Browser-based checks remain pending while the operator browser connection is unavailable; mocked transport tests do not establish live persistence.

## Release

Use the existing governed release process in `deploy/release/README.md`. Keep staging and production evidence separate, retain rollback/recovery evidence, and preserve the production environment's human approval gate. A successful staging workflow is not production verification.

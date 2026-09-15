# Issue execution override authorization

Issue create and update previously accepted adapter configuration and workspace setup commands from company agents and ordinary board members. That bypassed the instance-operator boundary on direct agent configuration.

The issue route now requires `assertInstanceAdmin` whenever a request supplies `assigneeAdapterOverrides` or `executionWorkspaceSettings`. The guard includes empty objects and null resets because replacing or clearing operator-owned policy also changes execution configuration. Instance administrators and the existing local implicit operator continue through normal company/issue checks. Ordinary title, description, status, assignment, document and work-product flows retain their existing authorization.

Inspected all issue persistence paths in `server/src/routes/issues.ts`: create, patch, bulk update, and comment-driven reopening. Bulk validation currently permits only status and assignees and strips execution fields; a defensive guard is also present after validation. Comment reopening constructs only a fixed status update and does not forward caller-supplied execution settings.

Focused tests in `server/src/__tests__/issue-execution-authorization.test.ts` cover agent and non-admin board rejection before persistence; provisioning, teardown and runtime configuration; null resets; operator create/update; ordinary agent/board task work; and bulk field stripping. The new suite and the existing comment-reopen and goal-context route suites passed together: 21 tests across 3 files, 5.80 seconds, using the Node 24 local test launcher. `git diff --check` passed for this change. No production configuration or runtime was changed.

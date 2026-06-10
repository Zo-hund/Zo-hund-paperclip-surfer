# Tools: Research Director (Director)

The Director agent employs the following Paperclip control-plane tools:

## 1. Issue Management Tools
* `list_issues`: Scans the current backlog of `HER` and `AMXA` issues.
* `update_issue_status`: Patches task states to reflect progress (e.g. `in_review` or `done`).
* `assign_issue`: Assigns tasks to the appropriate specialist agent (`Hermes Sentinel` or `Nous Specialist`).

## 2. Team Communication Tools
* `send_message`: Sends messages or delegation directives to active specialists.
* `get_heartbeat_status`: Monitors active agent heartbeat logs to ensure operational health.

## 3. Review & Approval Tools
* `approve_work_product`: Reviews work products submitted by specialists and marks them as approved.
* `reject_work_product`: Requests changes or corrections from specialists on failed verifications.

# Paperclip API Reference

Quick reference for the Paperclip API endpoints used by the work order pipeline.

**Base URL:** `http://localhost:3100/api`  
**Authentication:** Bearer token in `Authorization` header

---

## Create Issue

Create a new Paperclip issue (for Stage 2 SIM and Stage 3 LIVE).

### Request

```
POST /companies/{companyId}/issues
Authorization: Bearer {PAPERCLIP_BOARD_TOKEN}
Content-Type: application/json
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `companyId` | string | Yes | Company UUID (e.g., `dece557d-8849-4040-b8ad-e0e235a54b52`) |

### Body

```json
{
  "title": "Weekly Revenue Report",
  "description": "[WORK ORDER]...",
  "priority": "high",
  "projectId": "d1234567-1234-5678-9abc-def012345678",
  "assigneeId": "482b3bd0-f6c3-44b6-82b4-83c2c97187d7",
  "labels": ["wo:WO-2026-001", "type:report"]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | Yes | Issue title (max 200 chars) |
| `description` | string | Yes | Issue description (supports Markdown) |
| `priority` | enum | No | "critical", "high", "medium", "low" |
| `projectId` | string | Yes | Paperclip project UUID |
| `assigneeId` | string | No | Agent UUID. If omitted, issue is unassigned (SIM). |
| `labels` | array | No | Array of label strings |

### Response (201 Created)

```json
{
  "id": "AMXA-2287",
  "identifier": "AMXA-2287",
  "title": "Weekly Revenue Report",
  "description": "[WORK ORDER]...",
  "priority": "high",
  "projectId": "d1234567-...",
  "assigneeId": "482b3bd0-...",
  "status": "open",
  "createdAt": "2026-04-27T14:00:00Z",
  "updatedAt": "2026-04-27T14:00:00Z",
  "labels": ["wo:WO-2026-001", "type:report"]
}
```

### Example (SIM Issue)

```bash
curl -X POST http://localhost:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/issues \
  -H "Authorization: Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "[SIM] Weekly Revenue Report",
    "description": "[WORK ORDER]\nID: WO-2026-001\n...",
    "priority": "high",
    "projectId": "d1234567-1234-5678-9abc-def012345678",
    "labels": ["sim", "evaluation", "wo:WO-2026-001"]
  }'
```

### Example (LIVE Issue with Assignment)

```bash
curl -X POST http://localhost:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/issues \
  -H "Authorization: Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Weekly Revenue Report",
    "description": "[WORK ORDER]\nID: WO-2026-001\n...",
    "priority": "high",
    "projectId": "d1234567-1234-5678-9abc-def012345678",
    "assigneeId": "482b3bd0-f6c3-44b6-82b4-83c2c97187d7",
    "labels": ["live", "wo:WO-2026-001", "type:report"]
  }'
```

---

## Get Issue

Retrieve issue details and status.

### Request

```
GET /issues/{issueId}
Authorization: Bearer {PAPERCLIP_BOARD_TOKEN}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issueId` | string | Yes | Issue ID (e.g., `AMXA-2287`) |

### Response (200 OK)

```json
{
  "id": "AMXA-2287",
  "identifier": "AMXA-2287",
  "title": "Weekly Revenue Report",
  "description": "[WORK ORDER]...",
  "priority": "high",
  "projectId": "d1234567-...",
  "assigneeId": "482b3bd0-...",
  "status": "closed",
  "createdAt": "2026-04-27T14:00:00Z",
  "updatedAt": "2026-04-27T14:45:00Z",
  "closedAt": "2026-04-27T14:45:00Z",
  "labels": ["live", "wo:WO-2026-001"]
}
```

### Example

```bash
curl http://localhost:3100/api/issues/AMXA-2287 \
  -H "Authorization: Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc"
```

---

## List Agents

Get list of available agents for assignment.

### Request

```
GET /companies/{companyId}/agents
Authorization: Bearer {PAPERCLIP_BOARD_TOKEN}
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max results to return (max 100) |
| `offset` | number | 0 | Offset for pagination |
| `status` | string | - | Filter by status (e.g., "idle", "active", "paused") |

### Response (200 OK)

```json
{
  "agents": [
    {
      "id": "482b3bd0-f6c3-44b6-82b4-83c2c97187d7",
      "name": "CEO",
      "role": "ceo",
      "status": "idle",
      "title": "Chief Executive Officer",
      "icon": "👔",
      "capabilities": ["strategy", "decision-making", "delegation"],
      "adapterType": "opencode_local",
      "budgetMonthlyCents": 100000,
      "spentMonthlyCents": 24500,
      "pauseReason": null
    },
    {
      "id": "1a7f6cad-62e8-4cee-b1e8-d7f3c9e8f4a2",
      "name": "CFO",
      "role": "cfo",
      "status": "idle",
      "title": "Chief Financial Officer",
      "icon": "💰",
      "capabilities": ["finance", "budgeting", "reporting"],
      "adapterType": "opencode_local",
      "budgetMonthlyCents": 80000,
      "spentMonthlyCents": 15000,
      "pauseReason": null
    },
    {
      "id": "696f77ba-3f81-438f-b77d-2c338fffd323",
      "name": "CMO",
      "role": "cmo",
      "status": "paused",
      "title": "Chief Marketing Officer",
      "icon": "📢",
      "capabilities": ["marketing", "growth", "content"],
      "adapterType": "opencode_local",
      "budgetMonthlyCents": 60000,
      "spentMonthlyCents": 58000,
      "pauseReason": "budget_exhausted"
    }
  ],
  "total": 3,
  "limit": 20,
  "offset": 0
}
```

### Example

```bash
curl "http://localhost:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/agents?limit=100" \
  -H "Authorization: Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc"
```

---

## Update Issue

Assign an issue or change its status.

### Request

```
PATCH /issues/{issueId}
Authorization: Bearer {PAPERCLIP_BOARD_TOKEN}
Content-Type: application/json
```

### Body

```json
{
  "assigneeId": "482b3bd0-f6c3-44b6-82b4-83c2c97187d7",
  "status": "closed"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `assigneeId` | string | Agent UUID (optional) |
| `status` | enum | "open", "in_progress", "closed" (optional) |
| `priority` | enum | "critical", "high", "medium", "low" (optional) |

### Response (200 OK)

```json
{
  "id": "AMXA-2287",
  "assigneeId": "482b3bd0-...",
  "status": "closed",
  ...
}
```

### Example

```bash
curl -X PATCH http://localhost:3100/api/issues/AMXA-2287 \
  -H "Authorization: Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
```

---

## Get Issue Activity

Retrieve activity log for an issue (for chain receipts).

### Request

```
GET /issues/{issueId}/activity
Authorization: Bearer {PAPERCLIP_BOARD_TOKEN}
```

### Response (200 OK)

```json
{
  "activities": [
    {
      "id": "act_abc123",
      "type": "created",
      "actor": "system",
      "timestamp": "2026-04-27T14:00:00Z",
      "data": {
        "title": "Weekly Revenue Report"
      }
    },
    {
      "id": "act_def456",
      "type": "assigned",
      "actor": "482b3bd0-...",
      "timestamp": "2026-04-27T14:05:00Z",
      "data": {
        "assigneeId": "482b3bd0-..."
      }
    },
    {
      "id": "act_ghi789",
      "type": "status_changed",
      "actor": "482b3bd0-...",
      "timestamp": "2026-04-27T14:45:00Z",
      "data": {
        "oldStatus": "open",
        "newStatus": "closed"
      }
    }
  ]
}
```

### Example

```bash
curl http://localhost:3100/api/issues/AMXA-2287/activity \
  -H "Authorization: Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc"
```

---

## Error Responses

All endpoints use standard HTTP status codes.

### 400 Bad Request

```json
{
  "error": "Invalid request",
  "message": "Missing required field: projectId",
  "code": "VALIDATION_ERROR"
}
```

### 404 Not Found

```json
{
  "error": "Not found",
  "message": "Issue AMXA-9999 not found",
  "code": "NOT_FOUND"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "message": "Database connection failed",
  "code": "INTERNAL_ERROR"
}
```

---

## Authentication

### Bearer Token Format

All requests require an `Authorization` header:

```
Authorization: Bearer {PAPERCLIP_BOARD_TOKEN}
```

Where `PAPERCLIP_BOARD_TOKEN` is defined in `.env`:

```
PAPERCLIP_BOARD_TOKEN=pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc
```

### Example

```bash
curl -H "Authorization: Bearer pcp_board_6a8061a8099b5044ec7c6b35f119699b38307a879fb8addc" \
  http://localhost:3100/api/companies/dece557d-8849-4040-b8ad-e0e235a54b52/agents
```

---

## Rate Limiting

Paperclip API has no explicit rate limits in development mode. In production, contact your Paperclip admin for limits.

---

## Pagination

List endpoints (e.g., `GET /agents`) support pagination:

```bash
# Get first 20 results
curl "http://localhost:3100/api/companies/{cid}/agents?limit=20&offset=0"

# Get next 20
curl "http://localhost:3100/api/companies/{cid}/agents?limit=20&offset=20"
```

---

## Common Patterns

### Create and Assign (One Request)

```bash
curl -X POST http://localhost:3100/api/companies/{cid}/issues \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Task",
    "description": "...",
    "projectId": "...",
    "assigneeId": "482b3bd0-..."
  }'
```

### Create Unassigned (SIM)

```bash
curl -X POST http://localhost:3100/api/companies/{cid}/issues \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "[SIM] Task",
    "description": "...",
    "projectId": "..."
  }'
```

### Check if Issue is Done

```bash
curl http://localhost:3100/api/issues/{issueId} \
  -H "Authorization: Bearer {token}" \
  | jq '.status'
# Output: "closed"
```

### Get Agent by Name

```bash
curl "http://localhost:3100/api/companies/{cid}/agents?limit=100" \
  -H "Authorization: Bearer {token}" \
  | jq '.agents[] | select(.name == "CEO") | .id'
# Output: "482b3bd0-f6c3-44b6-82b4-83c2c97187d7"
```

---

## Next Steps

- **Setting up the environment?** See [CONFIGURATION](CONFIGURATION.md)
- **Extending the pipeline?** See [ARCHITECTURE](ARCHITECTURE.md)
- **Having issues?** See [TROUBLESHOOTING](TROUBLESHOOTING.md)

# AMX Learn Mode LMS

The LMS connects training, workshops, market simulations, live showcases, proof, and earning through one tenant-scoped program record.

## User surfaces

- `/learn` is the member runway. Learners enroll, follow drip unlocks, launch missions and Pods, submit proof, enter approved live venues, and see earned value.
- `/control/learning` is the trainer/operator console. Staff publish programs, set prerequisites and release dates, inspect rosters, attendance, evidence, completion, and released earnings.

## Program state

Every program is composed of modules in five stages: `learn`, `practice`, `prove`, `live`, and `earn`. Modules may require a completed prerequisite and may have a scheduled release time. The server enforces both conditions.

Enrollment records persist completed module IDs, attendance minutes, evidence count, score, completion status, and released earnings. Activity events provide an append-only audit trail for progress changes.

## APIs

- `GET /api/lms/programs?tenantId=<tenant>&learnerId=<member>`
- `PUT /api/lms/programs`
- `POST /api/lms/enrollments`
- `POST /api/lms/enrollments/:id/progress`

Tenant access is checked server-side. Program writes require trainer or operator access. Members can enroll and update only their own records. Earnings are calculated from the published program after all modules are complete; payment settlement remains governed by the x402 operator approval ledger.

## Deployment

Apply `drizzle/0012_lms_learning_control.sql` for Sites D1. The matching Supabase migration enables RLS for environments that mirror LMS records into the member data plane.

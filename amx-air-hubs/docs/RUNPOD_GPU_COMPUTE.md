# Runpod GPU Compute

AMX routes approved remote workloads through the operator-only `/control/gpu` console. Browser clients never receive the Runpod key or endpoint identifiers.

## Workload lanes

- `realtime-video` and `vision` use `RUNPOD_LIVE_ENDPOINT_ID`.
- `render` uses `RUNPOD_RENDER_ENDPOINT_ID`.
- `digital-twin` and `multimodal-agent` use `RUNPOD_ENDPOINT_ID`.
- `training` uses `RUNPOD_TRAINING_ENDPOINT_ID`, falls back to the default endpoint, and requires an explicit operator approval for every job.

Endpoints are fixed Worker environment bindings. Requests cannot supply an upstream URL or endpoint ID. Create a restricted Runpod key that can submit, inspect, and cancel jobs only on these endpoint IDs.

## Data path

1. The operator selects an allowlisted workload, source, result route, and room.
2. The Worker checks tenant status, workload and GPU allowlists, per-job cost, monthly budget, and concurrency.
3. The Worker submits an asynchronous Runpod `/run` request with execution timeout, TTL, and a job-scoped signed callback.
4. The callback or operator status refresh reconciles the provider state.
5. Completed image, video, audio, or PDF outputs under 25 MB are copied into the AMX `MEDIA` binding before Runpod's asynchronous result retention expires.
6. Stage video outputs can be added to the existing hot-load library. LiveKit delivery creates an auditable ingress handoff and fails closed when LiveKit is not configured.

## Deployment

Apply `drizzle/0015_runpod_gpu_compute.sql` to Sites D1. Apply `supabase/migrations/20260814190000_runpod_gpu_compute.sql` only when mirroring the operator ledger into Supabase.

Set every `RUNPOD_*` value shown in `.env.example`. Generate `RUNPOD_WEBHOOK_SECRET` from at least 32 random bytes. The callback base must be the public HTTPS AMX origin and must not contain a path, query, or credentials.

Add `runpod` to `REQUIRED_SERVICES` only after the restricted key and at least one endpoint are configured. Production tier requires it automatically.

## Failure behavior

- Missing key, callback secret, or workload endpoint: `503`.
- Disallowed workload or GPU: `403`.
- Missing training approval, exhausted budget, or concurrency limit: `409`.
- Invalid callback signature or provider job mismatch: rejected without changing the ledger.
- Stage delivery of a non-video output: rejected; the asset remains archived.
- LiveKit unavailable: delivery is recorded as blocked and no live-track claim is made.

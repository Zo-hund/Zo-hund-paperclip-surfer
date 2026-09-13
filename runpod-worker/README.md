# AMX Runpod Worker

Queue worker for the governed AMX GPU control plane. The first endpoint supports
`digital-twin` and `multimodal-agent` jobs and returns structured, tenant-scoped
text results using `Qwen/Qwen2.5-3B-Instruct`.

Runpod GitHub deployment settings:

- Dockerfile path: `/runpod-worker/Dockerfile`
- Build context: `runpod-worker`
- Endpoint type: Queue
- Active workers: `0`
- Max workers: `1`

Vision, realtime video, rendering, and training require separate endpoint images
and are intentionally rejected by this worker instead of silently degrading.

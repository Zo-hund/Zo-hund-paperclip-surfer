#!/usr/bin/env bash
# Isolated CI-only runtime check. This never deploys an environment.
set -euo pipefail
: "${RELEASE_IMAGE:?An exact built image is required}"
CID=$(docker run -d --cap-drop ALL --security-opt no-new-privileges:true \
  -p 127.0.0.1:3100:3100 \
  -e PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  -e PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
  -e PAPERCLIP_PUBLIC_URL=http://localhost:3100 \
  -e HEARTBEAT_SCHEDULER_ENABLED=false \
  -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)" "$RELEASE_IMAGE")
trap 'docker rm -fv "$CID" >/dev/null' EXIT
docker exec "$CID" sh -c 'for tool in claude codex opencode pi hermes ffmpeg python3 npm pnpm; do command -v "$tool" || exit 1; done'
for attempt in {1..60}; do
  if python3 deploy/release/smoke.py http://localhost:3100; then exit 0; fi
  sleep 2
done
docker logs --tail 100 "$CID"
exit 1

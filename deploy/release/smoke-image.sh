#!/usr/bin/env bash
# Isolated CI-only runtime check. This never deploys an environment.
set -euo pipefail
: "${RELEASE_IMAGE:?An exact built image is required}"
: "${SMOKE_PORT:=3100}"
if ! [[ "$SMOKE_PORT" =~ ^[0-9]+$ ]] || (( SMOKE_PORT < 1024 || SMOKE_PORT > 65535 )); then
  echo "SMOKE_PORT must be a port between 1024 and 65535" >&2
  exit 1
fi
CID=$(docker run -d --cap-drop ALL --security-opt no-new-privileges:true \
  -p "127.0.0.1:${SMOKE_PORT}:3100" \
  -e PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  -e PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
  -e "PAPERCLIP_PUBLIC_URL=http://localhost:${SMOKE_PORT}" \
  -e HEARTBEAT_SCHEDULER_ENABLED=false \
  -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)" "$RELEASE_IMAGE")
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then docker logs --tail 100 "$CID" || true; fi
  docker rm -fv "$CID" >/dev/null || true
  exit "$status"
}
trap cleanup EXIT
docker exec "$CID" sh -c 'for tool in claude codex opencode pi hermes ffmpeg python3 npm pnpm; do command -v "$tool" || exit 1; done'
# Exercise the launchers, not only their presence on PATH. No provider login
# or paid agent run is needed for these bounded CLI checks.
docker exec "$CID" sh -ec '
  for tool in claude codex opencode pi python3 npm pnpm; do
    timeout 30 "$tool" --version
  done
  timeout 30 hermes --help >/dev/null
  timeout 30 ffmpeg -version >/dev/null
  python3 -c "import ssl; import cryptography; import PIL; import runway; import jwt"
  media_dir=$(mktemp -d)
  trap '\''rm -rf "$media_dir"'\'' EXIT
  timeout 30 ffmpeg -hide_banner -loglevel error \
    -f lavfi -i testsrc=size=128x128:rate=5 -f lavfi -i sine=frequency=440 \
    -t 1 -c:v libx264 -pix_fmt yuv420p -c:a aac "$media_dir/probe.mp4"
  ffprobe -v error -show_entries stream=codec_name -of csv=p=0 "$media_dir/probe.mp4"
'
for attempt in {1..60}; do
  if python3 deploy/release/smoke.py "http://localhost:${SMOKE_PORT}"; then exit 0; fi
  sleep 2
done
exit 1

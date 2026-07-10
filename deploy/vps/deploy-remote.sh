#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${1:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vps.yml}"
ENV_FILE="${ENV_FILE:-.env.vps}"
HEALTH_URL="${HEALTH_URL:-}"
# Direct check against the host-published app port (127.0.0.1:3100 in the vps
# layout, 3100:3100 in hostinger). HEALTH_URL goes through Cloudflare and the
# shared traefik, which can keep serving 502 for minutes after the container
# is recreated while traefik refreshes its upstream — so the deploy gate must
# use the direct URL and treat the through-proxy check as advisory only.
LOCAL_HEALTH_URL="${LOCAL_HEALTH_URL:-http://127.0.0.1:3100}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"
BACKUP_ROOT="${BACKUP_ROOT:-${DEPLOY_DIR}/.deploy-backups}"

read_env() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  line="${line#${key}=}"
  line="${line%\"}"
  line="${line#\"}"
  printf '%s' "${line}"
}

cd "${DEPLOY_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE} in ${DEPLOY_DIR}" >&2
  exit 1
fi

mkdir -p "${BACKUP_ROOT}"

TRAEFIK_ACME_STORAGE="$(read_env TRAEFIK_ACME_STORAGE)"
PAPERCLIP_DATA_PATH="$(read_env PAPERCLIP_DATA_PATH)"
COMPOSE_PROJECT_NAME_VALUE="$(read_env COMPOSE_PROJECT_NAME)"
GHCR_PULL_USERNAME_VALUE="$(read_env GHCR_PULL_USERNAME)"
GHCR_PULL_TOKEN_VALUE="$(read_env GHCR_PULL_TOKEN)"
APP_SERVICE_NAME_VALUE="$(read_env APP_SERVICE_NAME)"
DEPLOY_LAYOUT_VALUE="$(read_env DEPLOY_LAYOUT)"
# Optional space-separated list of services to deploy. When set, pull/up are
# scoped to these services only — useful when the compose file declares
# services (e.g. traefik) that are intentionally not run on this host and
# would otherwise fail `up` and abort the deploy.
DEPLOY_SERVICES_VALUE="$(read_env DEPLOY_SERVICES)"
AMX_IMAGE_VALUE="$(read_env AMX_IMAGE)"
POSTGRES_USER_VALUE="$(read_env POSTGRES_USER)"
POSTGRES_PASSWORD_VALUE="$(read_env POSTGRES_PASSWORD)"
POSTGRES_DB_VALUE="$(read_env POSTGRES_DB)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

if [[ -z "${TRAEFIK_ACME_STORAGE}" ]]; then
  TRAEFIK_ACME_STORAGE="./traefik/acme"
fi

if [[ -z "${PAPERCLIP_DATA_PATH}" ]]; then
  PAPERCLIP_DATA_PATH="./paperclip-data"
fi

if [[ -z "${COMPOSE_PROJECT_NAME_VALUE}" ]]; then
  COMPOSE_PROJECT_NAME_VALUE="amx-air-hubs"
fi

if [[ -z "${APP_SERVICE_NAME_VALUE}" ]]; then
  APP_SERVICE_NAME_VALUE="amx"
fi

if [[ -z "${DEPLOY_LAYOUT_VALUE}" ]]; then
  DEPLOY_LAYOUT_VALUE="generic"
fi

if [[ -z "${POSTGRES_USER_VALUE}" ]]; then
  POSTGRES_USER_VALUE="paperclip"
fi

if [[ -z "${POSTGRES_PASSWORD_VALUE}" ]]; then
  POSTGRES_PASSWORD_VALUE="paperclip"
fi

if [[ -z "${POSTGRES_DB_VALUE}" ]]; then
  POSTGRES_DB_VALUE="paperclip"
fi

mkdir -p "${RELEASE_BACKUP_DIR}"
if [[ -f "${COMPOSE_FILE}" ]]; then
  cp "${COMPOSE_FILE}" "${RELEASE_BACKUP_DIR}/$(basename "${COMPOSE_FILE}")"
fi
if [[ -f "${ENV_FILE}" ]]; then
  cp "${ENV_FILE}" "${RELEASE_BACKUP_DIR}/$(basename "${ENV_FILE}")"
fi
if [[ -f ".last-successful-release" ]]; then
  cp ".last-successful-release" "${RELEASE_BACKUP_DIR}/last-successful-release.previous"
fi

if docker ps --format '{{.Names}}' | grep -Fxq "${COMPOSE_PROJECT_NAME_VALUE}-db-1"; then
  if docker exec "${COMPOSE_PROJECT_NAME_VALUE}-db-1" sh -lc "command -v pg_dump >/dev/null 2>&1"; then
    docker exec \
      -e "PGPASSWORD=${POSTGRES_PASSWORD_VALUE}" \
      "${COMPOSE_PROJECT_NAME_VALUE}-db-1" \
      pg_dump -U "${POSTGRES_USER_VALUE}" -d "${POSTGRES_DB_VALUE}" --clean --if-exists \
      > "${RELEASE_BACKUP_DIR}/database.sql"
  fi
fi

if [[ "${DEPLOY_LAYOUT_VALUE}" != "hostinger-shared-traefik" ]]; then
  mkdir -p "${TRAEFIK_ACME_STORAGE}" "${PAPERCLIP_DATA_PATH}"
  touch "${TRAEFIK_ACME_STORAGE}/acme.json"
  chmod 600 "${TRAEFIK_ACME_STORAGE}/acme.json"
fi

# ── OPPRRC delivery volume (idempotent) ─────────────────────────────────────
OPPRRC_ROOT="${PAPERCLIP_DATA_PATH}/opprrc"
mkdir -p \
  "${OPPRRC_ROOT}/01_ORGANIZATIONS/BOARD-INTERNAL" \
  "${OPPRRC_ROOT}/01_ORGANIZATIONS/CLIENTS-EXTERNAL" \
  "${OPPRRC_ROOT}/02_PROGRAMS/BOARD-INTERNAL" \
  "${OPPRRC_ROOT}/02_PROGRAMS/CLIENTS-EXTERNAL" \
  "${OPPRRC_ROOT}/03_PROJECTS/BOARD-INTERNAL" \
  "${OPPRRC_ROOT}/03_PROJECTS/CLIENTS-EXTERNAL" \
  "${OPPRRC_ROOT}/04_RESOURCES/BOARD-INTERNAL" \
  "${OPPRRC_ROOT}/04_RESOURCES/CLIENTS-EXTERNAL" \
  "${OPPRRC_ROOT}/05_REPORTS/BOARD-INTERNAL" \
  "${OPPRRC_ROOT}/05_REPORTS/CLIENTS-EXTERNAL" \
  "${OPPRRC_ROOT}/06_CERTIFICATES/BOARD-INTERNAL" \
  "${OPPRRC_ROOT}/06_CERTIFICATES/CLIENTS-EXTERNAL" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/BLAK_KOFFEE" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/KY_SCIENCE_CENTER" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/SIMMONS_COLLEGE" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/EAST_BROADWAY_THEATER" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/KACOON_ACADEMY" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/TECH_AT_NITE" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/GRADED_GAMING" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/SCREENS_AND_DREAMS" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/DERBYX" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/REAL_DEALR" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/50_50_MENTORING" \
  "${OPPRRC_ROOT}/11_MEDIA_LIBRARY/CLIENTS-EXTERNAL/TBD" \
  "${OPPRRC_ROOT}/_metadata" \
  "${OPPRRC_ROOT}/_exports" \
  "${OPPRRC_ROOT}/_backups"

if [[ ! -f "${OPPRRC_ROOT}/RUN-CONTROL.json" ]]; then
  printf '{"version":1,"totalRuns":0,"hardStopAt":100,"driveBackupStatus":"pending","resetLog":[],"history":[]}\n' \
    > "${OPPRRC_ROOT}/RUN-CONTROL.json"
fi
# ─────────────────────────────────────────────────────────────────────────────

if [[ -n "${GHCR_PULL_USERNAME_VALUE}" && -n "${GHCR_PULL_TOKEN_VALUE}" ]]; then
  echo "${GHCR_PULL_TOKEN_VALUE}" | docker login ghcr.io -u "${GHCR_PULL_USERNAME_VALUE}" --password-stdin
fi

# --build: services with a local build context (voice-agent) are otherwise
# never rebuilt after the workflow uploads new source — image-based services
# (amx) are unaffected by the flag.
if [[ -n "${DEPLOY_SERVICES_VALUE}" ]]; then
  # shellcheck disable=SC2086 — intentional word splitting of service list
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" pull --ignore-buildable ${DEPLOY_SERVICES_VALUE}
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --no-deps --build ${DEPLOY_SERVICES_VALUE}
else
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" pull --ignore-buildable
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans --build
fi

# voice-agent is built from source the deploy workflow uploads to the host,
# and DEPLOY_SERVICES typically scopes the rollout to the image-based app —
# so rebuild it explicitly here or agent.py changes never reach prod.
# Build and recreate as two explicit steps with --force-recreate: a plain
# `up --build` was observed to leave the old container running when compose
# decided nothing changed, so agent.py edits silently never went live.
# Non-fatal: a voice-agent build failure must not fail the app deploy.
if [[ -n "${DEPLOY_SERVICES_VALUE}" && " ${DEPLOY_SERVICES_VALUE} " != *" voice-agent "* ]]; then
  if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config --services 2>/dev/null | grep -qx "voice-agent"; then
    echo "Rebuilding voice-agent from uploaded source (outside DEPLOY_SERVICES=${DEPLOY_SERVICES_VALUE})..."
    if docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" build voice-agent \
       && docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate voice-agent; then
      echo "voice-agent rebuilt and recreated."
    else
      echo "WARNING: voice-agent rebuild failed (non-fatal); previous container keeps running" >&2
    fi
  fi
fi

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

healthy=""
for attempt in $(seq 1 "${MAX_ATTEMPTS}"); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${COMPOSE_PROJECT_NAME_VALUE}-${APP_SERVICE_NAME_VALUE}-1" 2>/dev/null || true)"
  echo "Checking deployment health... Attempt ${attempt}/${MAX_ATTEMPTS} (Container state: ${status:-unknown})"
  if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
    code="$(curl -sS -o /dev/null -w '%{http_code}' "${LOCAL_HEALTH_URL}" || true)"
    echo "  Direct curl at ${LOCAL_HEALTH_URL} returned status code: ${code:-failed}"
    if [[ "${code}" =~ ^[0-9]+$ ]] && [[ "${code}" -ge 200 && "${code}" -lt 400 ]]; then
      healthy=1
      break
    fi
  fi
  sleep 10
done

if [[ -z "${healthy}" ]]; then
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" logs --tail 200
  echo "Deployment failed health checks" >&2
  exit 1
fi

cat > ".last-successful-release" <<EOF
timestamp=${TIMESTAMP}
deploy_dir=${DEPLOY_DIR}
compose_file=${COMPOSE_FILE}
env_file=${ENV_FILE}
deploy_layout=${DEPLOY_LAYOUT_VALUE}
compose_project_name=${COMPOSE_PROJECT_NAME_VALUE}
app_service_name=${APP_SERVICE_NAME_VALUE}
local_health_url=${LOCAL_HEALTH_URL}
health_url=${HEALTH_URL}
image=${AMX_IMAGE_VALUE}
backup_dir=${RELEASE_BACKUP_DIR}
EOF

echo "Deployment healthy (direct check at ${LOCAL_HEALTH_URL})"

# Advisory only: traefik may serve stale 502s from its old upstream for a few
# minutes after the container is recreated, so a proxy failure here must not
# fail the deploy.
if [[ -n "${HEALTH_URL}" ]]; then
  code="$(curl -sS -o /dev/null -w '%{http_code}' "${HEALTH_URL}" || true)"
  if [[ "${code}" =~ ^[0-9]+$ ]] && [[ "${code}" -ge 200 && "${code}" -lt 400 ]]; then
    echo "Through-proxy check at ${HEALTH_URL} returned ${code}"
  else
    echo "WARNING: through-proxy check at ${HEALTH_URL} returned ${code:-failed}; traefik/Cloudflare may still be refreshing the upstream. Not failing the deploy." >&2
  fi
fi

exit 0

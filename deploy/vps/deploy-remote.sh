#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${1:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vps.yml}"
ENV_FILE="${ENV_FILE:-.env.vps}"
HEALTH_URL="${HEALTH_URL:-}"
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

if [[ -n "${GHCR_PULL_USERNAME_VALUE}" && -n "${GHCR_PULL_TOKEN_VALUE}" ]]; then
  echo "${GHCR_PULL_TOKEN_VALUE}" | docker login ghcr.io -u "${GHCR_PULL_USERNAME_VALUE}" --password-stdin
fi

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" pull
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

for attempt in $(seq 1 "${MAX_ATTEMPTS}"); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${COMPOSE_PROJECT_NAME_VALUE}-${APP_SERVICE_NAME_VALUE}-1" 2>/dev/null || true)"
  if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
    if [[ -n "${HEALTH_URL}" ]]; then
      code="$(curl -sS -o /dev/null -w '%{http_code}' "${HEALTH_URL}" || true)"
      if [[ "${code}" =~ ^[0-9]+$ ]] && [[ "${code}" -ge 200 && "${code}" -lt 400 ]]; then
        cat > ".last-successful-release" <<EOF
timestamp=${TIMESTAMP}
deploy_dir=${DEPLOY_DIR}
compose_file=${COMPOSE_FILE}
env_file=${ENV_FILE}
deploy_layout=${DEPLOY_LAYOUT_VALUE}
compose_project_name=${COMPOSE_PROJECT_NAME_VALUE}
app_service_name=${APP_SERVICE_NAME_VALUE}
health_url=${HEALTH_URL}
image=${AMX_IMAGE_VALUE}
backup_dir=${RELEASE_BACKUP_DIR}
EOF
        echo "Deployment healthy at ${HEALTH_URL}"
        exit 0
      fi
    else
      cat > ".last-successful-release" <<EOF
timestamp=${TIMESTAMP}
deploy_dir=${DEPLOY_DIR}
compose_file=${COMPOSE_FILE}
env_file=${ENV_FILE}
deploy_layout=${DEPLOY_LAYOUT_VALUE}
compose_project_name=${COMPOSE_PROJECT_NAME_VALUE}
app_service_name=${APP_SERVICE_NAME_VALUE}
image=${AMX_IMAGE_VALUE}
backup_dir=${RELEASE_BACKUP_DIR}
EOF
      echo "Deployment healthy"
      exit 0
    fi
  fi
  sleep 10
done

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" logs --tail 200
echo "Deployment failed health checks" >&2
exit 1

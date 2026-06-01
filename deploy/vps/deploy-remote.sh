#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${1:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.vps.yml}"
ENV_FILE="${ENV_FILE:-.env.vps}"
HEALTH_URL="${HEALTH_URL:-}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-30}"

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

TRAEFIK_ACME_STORAGE="$(read_env TRAEFIK_ACME_STORAGE)"
PAPERCLIP_DATA_PATH="$(read_env PAPERCLIP_DATA_PATH)"
COMPOSE_PROJECT_NAME_VALUE="$(read_env COMPOSE_PROJECT_NAME)"
GHCR_PULL_USERNAME_VALUE="$(read_env GHCR_PULL_USERNAME)"
GHCR_PULL_TOKEN_VALUE="$(read_env GHCR_PULL_TOKEN)"
APP_SERVICE_NAME_VALUE="$(read_env APP_SERVICE_NAME)"
DEPLOY_LAYOUT_VALUE="$(read_env DEPLOY_LAYOUT)"

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
        echo "Deployment healthy at ${HEALTH_URL}"
        exit 0
      fi
    else
      echo "Deployment healthy"
      exit 0
    fi
  fi
  sleep 10
done

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" logs --tail 200
echo "Deployment failed health checks" >&2
exit 1

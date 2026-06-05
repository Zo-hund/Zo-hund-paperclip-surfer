#!/usr/bin/env bash
# deploy/scripts/rotate-secrets.sh
#
# Rotates BETTER_AUTH_SECRET and PAPERCLIP_AGENT_JWT_SECRET.
# Updates the Kubernetes secret in-cluster and prints the GitHub CLI commands
# to update the repository secrets.
#
# Prerequisites:
#   - kubectl configured with access to the target namespace
#   - gh (GitHub CLI) authenticated (for the gh secret set commands)
#
# Usage:
#   bash deploy/scripts/rotate-secrets.sh [NAMESPACE] [GITHUB_REPO]
#
# Examples:
#   bash deploy/scripts/rotate-secrets.sh amx-air-hubs Zo-hund/Zo-hund-paperclip-surfer
#   bash deploy/scripts/rotate-secrets.sh amx-air-hubs-staging Zo-hund/Zo-hund-paperclip-surfer

set -euo pipefail

NAMESPACE="${1:-amx-air-hubs}"
GITHUB_REPO="${2:-}"
K8S_SECRET_NAME="amx-secrets"

echo "==> Generating new secrets..."
NEW_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NEW_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

echo "==> New BETTER_AUTH_SECRET:        ${NEW_AUTH_SECRET:0:8}... (truncated)"
echo "==> New PAPERCLIP_AGENT_JWT_SECRET: ${NEW_JWT_SECRET:0:8}... (truncated)"

echo ""
echo "==> Patching Kubernetes secret '${K8S_SECRET_NAME}' in namespace '${NAMESPACE}'..."

NEW_AUTH_B64=$(printf '%s' "${NEW_AUTH_SECRET}" | base64)
NEW_JWT_B64=$(printf '%s' "${NEW_JWT_SECRET}" | base64)

kubectl patch secret "${K8S_SECRET_NAME}" \
  --namespace "${NAMESPACE}" \
  --type=json \
  -p "[
    {\"op\": \"replace\", \"path\": \"/data/BETTER_AUTH_SECRET\",      \"value\": \"${NEW_AUTH_B64}\"},
    {\"op\": \"replace\", \"path\": \"/data/PAPERCLIP_AGENT_JWT_SECRET\", \"value\": \"${NEW_JWT_B64}\"}
  ]"

echo "==> Kubernetes secret patched."
echo ""
echo "==> Triggering rolling restart to pick up new secrets..."
kubectl rollout restart deployment -n "${NAMESPACE}"
kubectl rollout status deployment -n "${NAMESPACE}" --timeout=5m
echo "==> Rollout complete."

echo ""
if [ -n "${GITHUB_REPO}" ]; then
  echo "==> Updating GitHub secrets via gh CLI..."
  printf '%s' "${NEW_AUTH_SECRET}" | gh secret set AMX_BETTER_AUTH_SECRET --repo "${GITHUB_REPO}"
  printf '%s' "${NEW_JWT_SECRET}"  | gh secret set PAPERCLIP_AGENT_JWT_SECRET --repo "${GITHUB_REPO}"
  echo "==> GitHub secrets updated."
else
  echo "==> GitHub CLI commands (run these to sync repo secrets):"
  echo ""
  echo "    echo '${NEW_AUTH_SECRET}' | gh secret set AMX_BETTER_AUTH_SECRET --repo <owner>/<repo>"
  echo "    echo '${NEW_JWT_SECRET}'  | gh secret set PAPERCLIP_AGENT_JWT_SECRET --repo <owner>/<repo>"
fi

echo ""
echo "==> Rotation complete. Record the rotation date:"
echo "    Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "    Namespace: ${NAMESPACE}"
echo "    Secrets rotated: BETTER_AUTH_SECRET, PAPERCLIP_AGENT_JWT_SECRET"

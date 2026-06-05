#!/usr/bin/env bash
# deploy/scripts/create-deploy-token.sh
#
# Creates a long-lived ServiceAccount token for the paperclip-deploy SA
# and outputs a minimal kubeconfig, base64-encoded, ready to paste into
# the GitHub secret KUBE_CONFIG_DATA.
#
# Prerequisites:
#   - kubectl configured with cluster-admin access
#   - The RBAC manifests must be applied first:
#       kubectl apply -f deploy/k8s/rbac/
#
# Usage:
#   bash deploy/scripts/create-deploy-token.sh [NAMESPACE]
#
# The NAMESPACE defaults to amx-air-hubs.

set -euo pipefail

NAMESPACE="${1:-amx-air-hubs}"
SA_NAME="paperclip-deploy"
SECRET_NAME="paperclip-deploy-token"

echo "==> Applying RBAC manifests..."
kubectl apply -f "$(dirname "$0")/../k8s/rbac/"

echo "==> Creating long-lived token secret for ${SA_NAME} in ${NAMESPACE}..."
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${SECRET_NAME}
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/service-account.name: ${SA_NAME}
type: kubernetes.io/service-account-token
EOF

echo "==> Waiting for token to be populated..."
for i in $(seq 1 10); do
  TOKEN=$(kubectl get secret "${SECRET_NAME}" -n "${NAMESPACE}" \
    -o jsonpath='{.data.token}' 2>/dev/null | base64 --decode || true)
  if [ -n "${TOKEN}" ]; then
    break
  fi
  sleep 2
done

if [ -z "${TOKEN:-}" ]; then
  echo "ERROR: Token was not populated after waiting. Check the ServiceAccount exists."
  exit 1
fi

# Get cluster info from current context
CLUSTER_SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CLUSTER_CA=$(kubectl config view --minify --raw \
  -o jsonpath='{.clusters[0].cluster.certificate-authority-data}')

echo "==> Building scoped kubeconfig..."
KUBECONFIG_CONTENT=$(cat <<KUBECONFIG
apiVersion: v1
kind: Config
clusters:
  - name: amx-cluster
    cluster:
      server: ${CLUSTER_SERVER}
      certificate-authority-data: ${CLUSTER_CA}
contexts:
  - name: paperclip-deploy@amx-cluster
    context:
      cluster: amx-cluster
      user: paperclip-deploy
      namespace: ${NAMESPACE}
current-context: paperclip-deploy@amx-cluster
users:
  - name: paperclip-deploy
    user:
      token: ${TOKEN}
KUBECONFIG
)

echo ""
echo "==> Base64-encoded KUBE_CONFIG_DATA (paste this into your GitHub secret):"
echo ""
printf '%s' "${KUBECONFIG_CONTENT}" | base64
echo ""
echo ""
echo "==> Verify the account cannot escalate privileges:"
echo "    kubectl auth can-i create clusterroles --as=system:serviceaccount:${NAMESPACE}:${SA_NAME}"
echo "    Expected: no"
echo ""
echo "==> Verify it can deploy:"
echo "    kubectl auth can-i create deployments --as=system:serviceaccount:${NAMESPACE}:${SA_NAME} -n ${NAMESPACE}"
echo "    Expected: yes"

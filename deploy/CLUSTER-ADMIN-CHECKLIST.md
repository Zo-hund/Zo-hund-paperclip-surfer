# AMX Cluster Admin Checklist

This runbook is the operational contract for staging-first AMX rollouts.

## 1. GitHub secrets

Configure these repository or environment secrets before any deployment:

- `KUBE_CONFIG_DATA`
- `AMX_DATABASE_URL`
- `AMX_BETTER_AUTH_SECRET`
- `GHCR_PULL_USERNAME` and `GHCR_PULL_TOKEN` when `ghcr.io/<owner>/amx-air-hubs` is private
- `OPENAI_API_KEY` if OpenAI-backed agents are enabled
- `ANTHROPIC_API_KEY` if Anthropic-backed agents are enabled
- `GOOGLE_API_KEY` if Gemini-backed agents are enabled

`KUBE_CONFIG_DATA` must be base64-encoded kubeconfig content with permission to create namespaces, apply secrets, install Helm releases, read rollout status, and manage ingress, services, HPA, and PDB resources.

Optional Cloudflare DNS automation for staging uses separate GitHub environment configuration:

- secret: `CLOUDFLARE_API_TOKEN`
- secret: `CLOUDFLARE_ZONE_ID`
- variable: `AMX_STAGING_DNS_TARGET`

`AMX_STAGING_DNS_TARGET` should be the staging ingress target, either an IPv4/IPv6 address or a hostname. When these values are configured, the deploy workflow creates or updates `staging.amx-air-hubs.cc` before it validates public DNS.

## 2. Cluster prerequisites

Confirm these are already present in the target cluster:

- ingress-nginx
- cert-manager
- `letsencrypt-staging` for staging and `letsencrypt-prod` for production
- DNS records for `staging.amx-air-hubs.cc` and `amx-air-hubs.cc`
- external Postgres reachable from the cluster using `AMX_DATABASE_URL`

## 3. Staging rollout

Let the `ci` workflow publish the image for the target commit, then deploy the immutable tag:

```text
sha-<commit>
```

Run the `Deploy AMX Cluster` workflow with:

- `environment=staging`
- `image_tag=sha-<commit>`
- leave namespace, release, and ingress host blank unless you intentionally need overrides

Default staging targets:

- namespace: `amx-air-hubs-staging`
- release: `amx-air-hubs-staging`
- ingress: `staging.amx-air-hubs.cc`

Expected workflow behavior:

- resolves the immutable `ghcr.io/<owner>/amx-air-hubs:sha-<commit>` image
- creates or updates `amx-secrets`
- creates or updates `amx-ghcr` when GHCR pull secrets are configured
- performs `helm upgrade --install --atomic --wait`
- checks the public staging URL before marking the run green

## 4. Staging acceptance checks

Run the smoke test:

```powershell
.\deploy\scripts\smoke-staging.ps1
```

Manual fallback checks:

```bash
kubectl get pods -n amx-air-hubs-staging
kubectl get ingress -n amx-air-hubs-staging
kubectl get hpa -n amx-air-hubs-staging
kubectl rollout status deployment/amx-air-hubs-staging -n amx-air-hubs-staging
```

Validate in the browser:

- `https://staging.amx-air-hubs.cc` loads
- auth/login works
- issue creation works
- agent activity works
- live event and websocket flows stay connected

For autoscaling validation, apply synthetic load and verify replicas grow above the staging minimum of `2`.

## 5. Production promotion

Promote only the same image tag that passed staging.

Run the `Deploy AMX Cluster` workflow with:

- `environment=production`
- `image_tag=sha-<commit>`
- leave namespace, release, and ingress host blank unless you intentionally need overrides

Default production targets:

- namespace: `amx-air-hubs`
- release: `amx-air-hubs`
- ingress: `amx-air-hubs.cc`

Production smoke test:

```powershell
.\deploy\scripts\smoke-staging.ps1 -Namespace amx-air-hubs -Deployment amx-air-hubs -Url https://amx-air-hubs.cc
```

Manual fallback checks:

```bash
kubectl get pods -n amx-air-hubs
kubectl get ingress -n amx-air-hubs
kubectl get hpa -n amx-air-hubs
kubectl rollout status deployment/amx-air-hubs -n amx-air-hubs
```

Then confirm:

- `https://amx-air-hubs.cc` serves the board
- at least 3 replicas are available
- pods are distributed across nodes
- live agent traffic remains stable

## 6. Rollback

If a deploy fails or the new release is unhealthy, inspect the failed pod and keep the failed image tag recorded:

```bash
kubectl describe pod -n <namespace> <pod-name>
kubectl logs -n <namespace> <pod-name>
```

Re-run `Deploy AMX Cluster` with the last known-good `sha-<commit>` tag.

If pods fail readiness because of missing or bad secrets, treat that as a release blocker and fix the secret inputs before retrying.

## 7. Team Access Roles

Three roles exist for the cluster. Use the narrowest role that covers the task.

| Role | Who | Can Do | Cannot Do |
|---|---|---|---|
| **cluster-admin** | Infra leads only | Anything | N/A — use sparingly |
| **paperclip-deploy** | CI/CD pipeline SA | Helm deploy, apply secrets, manage HPA/PDB | Delete live pods/services, read secret values |
| **paperclip-viewer** | On-call / monitoring | Get/list/watch all resources, read pod logs | Modify anything |

Apply the RBAC manifests once with cluster-admin:

```bash
kubectl apply -f deploy/k8s/rbac/
```

Generate a scoped kubeconfig for CI (replace the cluster-admin `KUBE_CONFIG_DATA`):

```bash
bash deploy/scripts/create-deploy-token.sh amx-air-hubs
```

Add viewers (edit `deploy/k8s/rbac/viewer-role.yaml` subjects array, then re-apply):

```bash
kubectl apply -f deploy/k8s/rbac/viewer-role.yaml
```

Verify the deploy account cannot escalate:

```bash
kubectl auth can-i create clusterroles \
  --as=system:serviceaccount:amx-air-hubs:paperclip-deploy
# Expected: no
```

## 8. Secret Rotation

Rotate `BETTER_AUTH_SECRET` and `PAPERCLIP_AGENT_JWT_SECRET` at least every 90 days
or immediately after any suspected credential compromise.

```bash
bash deploy/scripts/rotate-secrets.sh amx-air-hubs <owner>/<repo>
```

The script:
1. Generates cryptographically random 32-byte hex secrets
2. Patches the `amx-secrets` Kubernetes secret in-place
3. Triggers a rolling restart so pods pick up the new values
4. Updates GitHub repository secrets via `gh` CLI (or prints the commands)

**Never commit secrets to the repo or log them in CI output.**

Rotation log — record each rotation in your runbook:

| Date | Namespace | Rotated By | Secrets |
|---|---|---|---|
| YYYY-MM-DD | amx-air-hubs | @username | BETTER_AUTH_SECRET, PAPERCLIP_AGENT_JWT_SECRET |

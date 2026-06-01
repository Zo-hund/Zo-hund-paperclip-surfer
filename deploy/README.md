# AMX AIR HUBS Deployments

This repo already ships a root [Dockerfile](../Dockerfile) and simple compose files. The primary cloud delivery path is now **per-target VPS deployment with Docker Compose**, while the Helm/Kubernetes release path remains available as the advanced cluster option.

- `docker-compose.cluster.yml`: local Docker deployment behind Traefik, suitable for single-host local staging and for `docker compose up --scale amx=N`.
- `deploy/vps/`: the canonical Hostinger and per-client VPS deployment bundle.
- `deploy/helm/amx-air-hubs`: the canonical AMX Kubernetes package for local and cloud clusters.
- `deploy/k8s/`: reference manifests and local cluster scaffolding.

## Local Docker

Use the root [Dockerfile](../Dockerfile) as the single AMX image source for both local and cloud flows.

Build the local image:

```powershell
docker build -t amx-air-hubs:local .
```

Start the single-node app + Postgres stack:

```powershell
Copy-Item .env.docker.example .env.docker
docker compose up --build
```

The default local image coordinate is `amx-air-hubs:local`.

## Local Docker cluster

1. Copy the env template:

```powershell
Copy-Item .env.cluster.example .env.cluster
```

2. Start the stack:

```powershell
docker compose --env-file .env.cluster -f docker-compose.cluster.yml up --build -d
```

3. Scale the AMX service if you want multiple app containers behind Traefik:

```powershell
docker compose --env-file .env.cluster -f docker-compose.cluster.yml up --build -d --scale amx=2
```

Endpoints:

- Board: [http://localhost:3100](http://localhost:3100)
- Traefik dashboard: [http://localhost:8080](http://localhost:8080)

## Local Kubernetes cluster

The preferred local-cluster path is the Helm chart. These commands assume a local ingress controller already exists in your cluster and that you already created `amx-secrets`.

```powershell
helm upgrade --install amx-air-hubs ./deploy/helm/amx-air-hubs `
  --namespace amx-air-hubs `
  --create-namespace `
  --values ./deploy/helm/amx-air-hubs/values-local.yaml `
  --set image.repository=amx-air-hubs `
  --set image.tag=local `
  --set secrets.existingSecretName=amx-secrets
```

The legacy local Kustomize overlay remains available if you specifically want bundled Postgres and PVC scaffolding:

```powershell
kubectl apply -k deploy/k8s/overlays/local
```

The local reference overlay includes:

- an in-cluster Postgres `StatefulSet`
- a persistent volume claim for `/paperclip`
- one AMX application replica
- ingress host `amx-air-hubs.local`

## Hostinger and client VPS deployment

This is the default production delivery path for AMX.

Use [VPS-ADMIN-CHECKLIST.md](./VPS-ADMIN-CHECKLIST.md) as the exact runbook for:

- pushing from local to GitHub
- confirming the immutable GHCR image exists
- deploying to Hostinger or another internal VPS
- onboarding and deploying a new client-specific VPS target
- rolling back to a previous `sha-<commit>` image

Main deployment bundle:

- [deploy/vps/docker-compose.vps.yml](./vps/docker-compose.vps.yml)
- [deploy/vps/docker-compose.hostinger.yml](./vps/docker-compose.hostinger.yml)
- [deploy/vps/.env.vps.example](./vps/.env.vps.example)
- [deploy/vps/.env.hostinger.example](./vps/.env.hostinger.example)
- [deploy/vps/bootstrap-vps.sh](./vps/bootstrap-vps.sh)
- [deploy/vps/deploy-remote.sh](./vps/deploy-remote.sh)
- [.github/workflows/deploy-vps.yml](../.github/workflows/deploy-vps.yml)

The VPS flow uses:

- GHCR immutable images
- one isolated stack per target
- external Postgres
- Traefik TLS termination
- persistent `/paperclip` storage on the VPS
- deploy-time backups of the active compose/env bundle and local Postgres dump when a bundled `db` service exists

Hostinger note:

- if the VPS already has Hostinger's shared Traefik on `80/443`, use the `hostinger-shared-traefik` layout
- that layout deploys into the existing app directory, reuses shared Traefik, and updates only the AMX compose stack
- in that layout, set `POSTGRES_PASSWORD` in the GitHub Environment secrets so the bundled local Postgres service is not left on the default credential

## Cloud Kubernetes deployment

The cloud cluster path uses the Helm chart, an external Postgres database, and CI-driven image rollouts. Keep this path for teams that want Kubernetes instead of the default VPS Compose delivery model.

The operator runbook lives at [CLUSTER-ADMIN-CHECKLIST.md](./CLUSTER-ADMIN-CHECKLIST.md). Use that document when you intentionally choose the Kubernetes route.

1. Create a secret named `amx-secrets` in the target namespace, or let the GitHub deploy workflow apply it from repository secrets.
2. Install or upgrade the release:

```bash
helm upgrade --install amx-air-hubs ./deploy/helm/amx-air-hubs \
  --namespace amx-air-hubs \
  --create-namespace \
  --values ./deploy/helm/amx-air-hubs/values-cloud.yaml \
  --set image.repository=ghcr.io/<org>/amx-air-hubs \
  --set image.tag=sha-<commit> \
  --set ingress.host=amx-air-hubs.cc \
  --set secrets.existingSecretName=amx-secrets
```

The legacy cloud Kustomize overlay remains only as reference scaffolding.

## Staging cluster

The first non-production rollout should use the staging values file:

```bash
helm upgrade --install amx-air-hubs-staging ./deploy/helm/amx-air-hubs \
  --namespace amx-air-hubs-staging \
  --create-namespace \
  --values ./deploy/helm/amx-air-hubs/values-staging.yaml \
  --set fullnameOverride=amx-air-hubs-staging \
  --set image.repository=ghcr.io/<org>/amx-air-hubs \
  --set image.tag=sha-<commit> \
  --set secrets.existingSecretName=amx-secrets
```

The GitHub Actions path now defaults to this same staging target after a successful `main` image publish. Production promotion is a separate manual workflow dispatch using the exact same immutable `sha-<commit>` tag.

Verified staging path:

1. `CI/CD Pipeline` on `main` validates the cluster compose pack, Helm chart, and publishes `ghcr.io/<owner>/amx-air-hubs:sha-<commit>`.
2. `Deploy AMX Cluster` triggers automatically for `staging`, confirms that exact image tag exists, applies runtime secrets, deploys with `helm upgrade --install --atomic --wait`, and smoke-checks `https://staging.amx-air-hubs.cc`.
3. Run the repo smoke script only after the workflow is green if you want a second operator-side check:

```powershell
.\deploy\scripts\smoke-staging.ps1
```

If the GHCR package is private, provide `GHCR_PULL_USERNAME` and `GHCR_PULL_TOKEN` secrets so the workflow can create the `amx-ghcr` pull secret in-cluster before rollout.

## CI/CD

- Local image tag: `amx-air-hubs:local`
- Cloud image tags:
  - `ghcr.io/<owner>/amx-air-hubs:sha-<commit>`
  - `ghcr.io/<owner>/amx-air-hubs:main`
  - `ghcr.io/<owner>/amx-air-hubs:latest`
- [ci.yml](../.github/workflows/ci.yml) builds and pushes immutable GHCR tags in the form `sha-<commit>`.
- The same workflow also validates the local cluster Compose pack, the VPS Compose pack, and the Helm chart before image publication.
- [deploy-vps.yml](../.github/workflows/deploy-vps.yml) deploys a chosen immutable tag to a Hostinger or client VPS target through SSH and Docker Compose.
- [deploy-cluster.yml](../.github/workflows/deploy-cluster.yml) deploys to staging automatically after successful `main` image publication, verifies the immutable image tag exists, performs an atomic Helm rollout, and smoke-checks the public URL. It also supports manual production promotion with `environment=production`.
- The deployment workflow emits a GitHub step summary showing the environment, image, host, and follow-up `kubectl` verification commands.
- [smoke-staging.ps1](./scripts/smoke-staging.ps1) verifies rollout health, ingress, HPA, pod availability, node spread, and the public URL.

## Notes

- The base image serves the UI from the server container, so no separate frontend deployment is required.
- The VPS deployment path is the preferred client-delivery model because it keeps one isolated stack, one secret set, and one deployment target per client.
- The local compose cluster shares `/paperclip` across replicas with a Docker volume. That is acceptable for a single-node lab setup, but cloud multi-replica deployments should move durable assets to managed storage.
- The Helm chart defaults to non-shared node-local `/paperclip` storage via `emptyDir`. Use the local values file or an explicit storage design if you need persistence.
- Database migrations are enabled at startup through `PAPERCLIP_MIGRATION_AUTO_APPLY=true`.

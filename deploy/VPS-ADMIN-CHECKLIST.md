# AMX VPS Admin Checklist

This is the primary operator path for Hostinger VPS and per-client isolated deployments.

## 1. GitHub environment secrets

Create one GitHub Environment per VPS target, for example:

- `hostinger-prod`
- `client-acme-prod`
- `client-acme-staging`

Set these secrets in each target environment:

- `VPS_HOST`
- `VPS_SSH_USER`
- `VPS_SSH_PORT`
- `VPS_SSH_PRIVATE_KEY`
- `AMX_DATABASE_URL`
- `AMX_BETTER_AUTH_SECRET`
- `TRAEFIK_ACME_EMAIL`
- optional `VPS_HOST_PUBLIC_KEY` for pinned SSH host verification
- optional `POSTGRES_PASSWORD` for the Hostinger local-Postgres layout
- optional `OPENAI_API_KEY`
- optional `ANTHROPIC_API_KEY`
- optional `GOOGLE_API_KEY`
- optional `GHCR_PULL_USERNAME`
- optional `GHCR_PULL_TOKEN`

Use [deploy/vps/CLIENT-TARGET-TEMPLATE.md](./vps/CLIENT-TARGET-TEMPLATE.md) as the onboarding checklist for each new client environment.

Optional variables or conventions per target:

- `VPS_LAYOUT=hostinger-shared-traefik` for Hostinger's prebuilt Docker+Traefik servers
- `VPS_DOMAIN` as a GitHub Environment variable if you do not want to pass `domain` every deploy
- `VPS_DEPLOY_DIR=/root/paperclip` for the existing Hostinger paperclip-style layout
- `VPS_COMPOSE_PROJECT_NAME=paperclip` for the existing Hostinger compose project name
- optional `POSTGRES_USER` and `POSTGRES_DB` variables for the Hostinger local-Postgres layout
- optional `DB_BACKUP_RETENTION_DAYS` variable if you want a documented retention target for deploy-time backups
- domain: use workflow input or store as an environment variable in your deployment process
- stack name: use workflow input or default to the target name
- deploy path: defaults to `/opt/amx/<stack-name>`

## 2. VPS prerequisites

On a new VPS:

1. Upload or run [deploy/vps/bootstrap-vps.sh](./vps/bootstrap-vps.sh)
2. Confirm Docker and Docker Compose plugin are installed
3. Confirm ports `80` and `443` are open
4. Confirm DNS for the target domain already points to the VPS
5. Confirm the external Postgres database is reachable from the VPS

If the VPS already ships with Hostinger shared Traefik and an existing `/root/paperclip` stack, do not install a second Traefik. Set `VPS_LAYOUT=hostinger-shared-traefik` and reuse the existing edge proxy.

Production note:

- for the generic VPS layout, `AMX_DATABASE_URL` and `TRAEFIK_ACME_EMAIL` are required
- for the Hostinger shared-Traefik layout, set a non-default `POSTGRES_PASSWORD` before the first production deploy if you are keeping the bundled Postgres container
- prefer `VPS_HOST_PUBLIC_KEY` over blind `ssh-keyscan` so the GitHub workflow pins the expected SSH host key

## 3. Release flow

1. Push your commit from local to GitHub
2. Wait for `CI/CD Pipeline` to publish:
   - `ghcr.io/<owner>/amx-air-hubs:sha-<commit>`
3. Run `Deploy AMX VPS` with:
   - `target_name=<github-environment-name>`
   - `image_tag=sha-<commit>`
   - optional `domain`
   - optional `stack_name`

## 4. Validation

After a green deploy:

- confirm the public URL loads
- confirm auth works
- confirm issue creation works
- confirm live/websocket flows stay connected

VPS checks:

```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml ps
docker compose --env-file .env.vps -f docker-compose.vps.yml logs --tail 200
curl -I https://<domain>
```

Deployment backup checks:

```bash
cd <deploy-dir>
cat .last-successful-release
ls -la .deploy-backups
```

## 5. Rollback

Re-run `Deploy AMX VPS` with the last known-good immutable tag:

- `image_tag=sha-<older-commit>`

The workflow reuses the same remote deployment bundle and only changes the image tag in `.env.vps`.

If you need to inspect the previous release metadata on the server, use:

```bash
cd <deploy-dir>
cat .last-successful-release
```

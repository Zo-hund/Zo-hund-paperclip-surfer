# Client VPS Target Template

Use this template when onboarding a new client deployment target.

## GitHub Environment

- Environment name: `client-<slug>-prod`

## Required secrets

- `VPS_HOST`
- `VPS_SSH_USER`
- `VPS_SSH_PORT`
- `VPS_SSH_PRIVATE_KEY`
- `AMX_DATABASE_URL`
- `AMX_BETTER_AUTH_SECRET`
- `TRAEFIK_ACME_EMAIL`

## Optional secrets

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `GHCR_PULL_USERNAME`
- `GHCR_PULL_TOKEN`

## Target defaults

- GitHub Environment variable: `VPS_DOMAIN=amx.<client-domain>`
- GitHub Environment variable: `VPS_LAYOUT=generic`
- Domain: `amx.<client-domain>`
- Stack name: `client-<slug>-prod`
- Deploy path: `/opt/amx/client-<slug>-prod`
- Public URL: `https://amx.<client-domain>`
- Persistent Paperclip path: `./paperclip-data`

For Hostinger-managed boxes that already have shared Traefik, use instead:

- `VPS_LAYOUT=hostinger-shared-traefik`
- `VPS_DEPLOY_DIR=/root/paperclip`
- `VPS_COMPOSE_PROJECT_NAME=paperclip`

## First deploy inputs

- `target_name=client-<slug>-prod`
- `image_tag=sha-<commit>`
- `domain=amx.<client-domain>`
- `stack_name=client-<slug>-prod`

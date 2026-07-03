FROM node:lts-trixie-slim AS base
# Build-time metadata args (injected by CI)
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY cli/package.json cli/
COPY server/package.json server/
COPY ui/package.json ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/adapter-utils/package.json packages/adapter-utils/
COPY packages/adapters/claude-local/package.json packages/adapters/claude-local/
COPY packages/adapters/codex-local/package.json packages/adapters/codex-local/
COPY packages/adapters/cursor-local/package.json packages/adapters/cursor-local/
COPY packages/adapters/gemini-local/package.json packages/adapters/gemini-local/
COPY packages/adapters/openclaw-gateway/package.json packages/adapters/openclaw-gateway/
COPY packages/adapters/opencode-local/package.json packages/adapters/opencode-local/
COPY packages/adapters/openrouter/package.json packages/adapters/openrouter/
COPY packages/adapters/pi-local/package.json packages/adapters/pi-local/
COPY packages/plugins/sdk/package.json packages/plugins/sdk/
COPY patches/ patches/

RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app /app
COPY . .
RUN pnpm --filter @paperclipai/shared build
RUN pnpm --filter @paperclipai/db build
RUN pnpm --filter "@paperclipai/adapter-*" build
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/ui build
RUN cd server && node_modules/.bin/tsc; mkdir -p dist/onboarding-assets && cp -R src/onboarding-assets/. dist/onboarding-assets/
RUN test -f server/dist/index.js || (echo "ERROR: server build output missing" && exit 1)

FROM node:lts-trixie-slim AS production
# Production stage: slim base + agent CLI runtimes
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates curl git \
       python3 python3-pip \
       ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --chown=node:node --from=build /app /app
COPY --chown=node:node docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Install adapter CLIs:
#   claude_local  → @anthropic-ai/claude-code
#   codex_local   → @openai/codex
#   opencode_local→ opencode-ai
#   pi_local      → @earendil-works/pi-coding-agent
#   hermes_local  → hermes-agent (pip)
RUN npm install --global --ignore-scripts \
      @anthropic-ai/claude-code@latest \
      @openai/codex@latest \
      opencode-ai \
      @earendil-works/pi-coding-agent \
  && pip3 install --break-system-packages --upgrade setuptools packaging \
  && pip3 install --break-system-packages hermes-agent runwayml \
  && sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /paperclip \
  && chown node:node /paperclip

ENV NODE_ENV=production \
  HOME=/paperclip \
  HOST=0.0.0.0 \
  PORT=3100 \
  SERVE_UI=true \
  PAPERCLIP_HOME=/paperclip \
  PAPERCLIP_INSTANCE_ID=default \
  PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \
  PAPERCLIP_IN_WORKTREE=false \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated \
  PAPERCLIP_DEPLOYMENT_EXPOSURE=private

# OCI image labels for traceability
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.title="amx-air-hubs" \
      org.opencontainers.image.description="Paperclip AI-agent control plane" \
      org.opencontainers.image.source="https://github.com/Zo-hund/Zo-hund-paperclip-surfer"

VOLUME ["/paperclip"]
EXPOSE 3100

# Health check via the dedicated API health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3100/api/health || exit 1

USER node
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]

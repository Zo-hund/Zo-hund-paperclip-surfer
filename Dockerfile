FROM node:lts-trixie-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc .pnpmfile.cjs ./
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
RUN cd server && node_modules/.bin/tsc && mkdir -p dist/onboarding-assets && cp -R src/onboarding-assets/. dist/onboarding-assets/
RUN test -f server/dist/index.js || (echo "ERROR: server build output missing" && exit 1)

FROM build AS runtime-deps
# Reinstall the locked production graph so build-only binaries are not shipped.
# The TypeScript loader remains an explicit server runtime dependency because
# workspace packages export TypeScript source in this checkout.
RUN rm -rf node_modules cli/node_modules server/node_modules ui/node_modules \
      amx-air-hubs/node_modules packages/*/node_modules packages/adapters/*/node_modules \
      packages/plugins/*/node_modules packages/plugins/examples/*/node_modules \
  && pnpm install --prod --frozen-lockfile --ignore-scripts
# Restore the platform package's bundled library symlinks explicitly. Without
# its vendor initializer, initdb/postgres exit 127 despite the binaries existing.
RUN for script in node_modules/.pnpm/@embedded-postgres+linux-*/node_modules/@embedded-postgres/linux-*/scripts/hydrate-symlinks.js; do \
      test -f "$script" || exit 1; \
      (cd "$(dirname "$script")/.." && node scripts/hydrate-symlinks.js) || exit 1; \
    done

# Hermes v0.21.2 is released on GitHub but not on PyPI. Upstream requires a
# source/editable installation to preserve its runtime assets; pin the release.
FROM base AS hermes-source
ADD https://github.com/NousResearch/hermes-agent/archive/939e45c91d751fadd94dcd1b873ac3cb44846213.tar.gz /tmp/hermes.tar.gz
RUN mkdir -p /opt/hermes \
  && tar -xzf /tmp/hermes.tar.gz -C /opt/hermes --strip-components=1 \
  && printf '%s\n' '939e45c91d751fadd94dcd1b873ac3cb44846213' > /opt/hermes/.hermes_build_sha

FROM node:lts-trixie-slim AS production
# Production stage: slim base + agent CLI runtimes
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends \
       ca-certificates curl git \
       python3 python3-pip \
       ffmpeg \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --chown=node:node docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --from=hermes-source /opt/hermes /opt/hermes
# Node's bundled npm still contains vulnerable compatible dependency versions.
# Upgrade the actual dependency code, retaining npm and every agent CLI.
# npm's source-only development/workspace metadata references unpublished
# packages, which npm resolves even with --omit=dev. Keep its runtime manifest.
RUN node -e "const fs = require('node:fs'); const p = '/usr/local/lib/node_modules/npm/package.json'; const j = JSON.parse(fs.readFileSync(p)); delete j.devDependencies; delete j.workspaces; fs.writeFileSync(p, JSON.stringify(j, null, 2));" \
  && npm install --prefix /usr/local/lib/node_modules/npm --save-exact --ignore-scripts \
      --omit=dev --package-lock=false brace-expansion@5.0.9 ip-address@10.3.1 tar@7.5.21 \
  && node -e "for (const [name, version] of Object.entries({'brace-expansion':'5.0.9','ip-address':'10.3.1','tar':'7.5.21'})) { if (require('/usr/local/lib/node_modules/npm/node_modules/' + name + '/package.json').version !== version) throw new Error('npm dependency version mismatch: ' + name); }" \
  && npm --version
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
  && node /usr/local/lib/node_modules/@anthropic-ai/claude-code/install.cjs \
  && (cd /usr/local/lib/node_modules/opencode-ai && node postinstall.mjs) \
  && pip3 install --break-system-packages --ignore-installed -e /opt/hermes runwayml \
       'cryptography>=50.0.0' 'pillow>=12.3.0' 'PyJWT>=2.13.0' \
  && pip3 check \
  && sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /paperclip \
  && chown node:node /paperclip

# Source edits must not invalidate the unchanged agent/media tool installation.
COPY --chown=node:node --from=runtime-deps /app /app

ENV NODE_ENV=production \
  PYTHONDONTWRITEBYTECODE=1 \
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
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION
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

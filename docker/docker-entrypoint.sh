#!/bin/sh
set -eu

if [ -n "${OPENAI_API_KEY:-}" ]; then
  SANITIZED_OPENAI_API_KEY="$(printf %s "$OPENAI_API_KEY" | tr -d '\r\n')"
  if [ -n "$SANITIZED_OPENAI_API_KEY" ]; then
    if printf %s "$SANITIZED_OPENAI_API_KEY" | codex login --with-api-key >/dev/null 2>&1; then
      echo "[paperclip] Codex API-key login initialized."
      export OPENAI_API_KEY="$SANITIZED_OPENAI_API_KEY"
    else
      echo "[paperclip] WARNING: Codex API-key login initialization failed; continuing startup."
    fi
  fi
fi

exec "$@"

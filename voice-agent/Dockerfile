# ── Stage 1: build + dependency install ──────────────────────────────────────
FROM python:3.12-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Cache model files in their own layer (only re-runs when requirements change)
RUN python -m livekit.agents download-files || true

COPY . .

# ── Stage 2: lean production image ───────────────────────────────────────────
FROM python:3.12-slim

RUN addgroup --gid 10001 appgroup && \
    adduser --uid 10001 --gid 10001 --no-create-home --disabled-password appuser

COPY --from=build --chown=appuser:appgroup /app /app

ENV PATH="/app/.venv/bin:$PATH"

USER appuser
WORKDIR /app

CMD ["python", "agent.py", "start"]

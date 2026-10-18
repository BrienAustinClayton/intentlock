#!/usr/bin/env bash
set -euo pipefail

# Run DB migrations (idempotent)
alembic upgrade head

# Seed demo user/agent (idempotent – safe to re-run on every deploy)
uv run python scripts/seed_demo.py

# Load Attack Lab fixtures (idempotent – safe to re-run on every deploy)
# Path is relative to this rootDir (services/intentlock)
uv run python ../../scripts/load_lab.py

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

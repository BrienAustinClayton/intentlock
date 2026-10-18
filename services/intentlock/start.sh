#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# uv sync installs into .venv, which is not on PATH at runtime: call it explicitly.
PY=.venv/bin/python

# Run DB migrations (idempotent)
$PY -m alembic upgrade head

# Seed demo user/agent and Attack Lab fixtures (idempotent, safe on every deploy)
$PY scripts/seed_demo.py
$PY ../../scripts/load_lab.py

exec $PY -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

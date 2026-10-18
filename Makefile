.PHONY: api web agent test migrate

api:
	cd services/intentlock && uv run uvicorn app.main:app --reload

web:
	cd apps/web && pnpm dev

agent:
	cd apps/agent && pnpm dev

test:
	cd services/intentlock && uv run pytest

migrate:
	cd services/intentlock && uv run alembic upgrade head

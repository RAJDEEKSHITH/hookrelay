# Hookrelay

A self-hostable webhook delivery service: a backend sends one event to `POST /v1/events`, and Hookrelay delivers it
to every subscribed endpoint with HMAC signatures, retries with exponential backoff, a circuit breaker,
dead-lettering and manual replay. A React dashboard shows what happened.

> Work in progress. The architecture diagram, delivery guarantees, load-test and chaos-test results will be added
> here when the project is complete.

## Run locally

Requirements: Node.js >= 24, pnpm 11, Docker.

```sh
cp .env.example .env        # then fill ENCRYPTION_KEY and COOKIE_SECRET
docker compose up -d        # Postgres 18 + Redis 8
pnpm install
pnpm db:migrate
pnpm dev
```

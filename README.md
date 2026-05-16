# arise-api

Backend REST API untuk **ARISE** — Hunter System tracker (Solo Leveling-themed).

## Stack

- **Runtime:** Node.js 22 + TypeScript (strict)
- **Framework:** NestJS 10
- **ORM:** Prisma 6 (client-side UUID v7 via `uuidv7` lib — lihat ADR 0002)
- **Database:** PostgreSQL 16 (reuse `airis_postgres` container existing — lihat ADR 0002)
- **Scheduler:** `@nestjs/schedule` (Phase 1 in-process cron) → BullMQ + Redis (Phase 2)
- **Validation:** class-validator + class-transformer + zod (env)
- **Docs:** Swagger / OpenAPI 3 (auto-generated)
- **Test:** Vitest + Supertest
- **Deploy:** Self-host Docker + Caddy reverse proxy (Linux)

## URLs

- Production: `https://api.tap-in.click`
- OpenAPI docs: `https://api.tap-in.click/docs`
- Local: `http://localhost:3000/v1`

## Dev Environment

**OS:** WSL Ubuntu (Recommended — match prod Linux, native perf)
**Project location:** `~/project/arise/arise-api/` (sebelumnya di Windows mount)

## Prerequisites

- WSL Ubuntu 22.04+ (atau Linux/macOS native)
- Docker Desktop running (untuk `airis_postgres` container)
- Container `airis_postgres` aktif (Postgres 16, host port 5433)

Cek: `docker ps | grep airis_postgres`

## First-Time Setup

```bash
# 1. Pindah project dari Windows mount ke WSL FS (one-time)
mkdir -p ~/project/arise
cp -r /mnt/c/Users/LEGION/Documents/Claude/Projects/me\ levelinig/arise-api ~/project/arise/
cd ~/project/arise/arise-api

# 2. Bootstrap WSL — install Node 22 + pnpm + deps (idempotent)
bash scripts/bootstrap-wsl.sh

# 3. Setup .env — generate JWT secrets
cp .env.example .env
openssl rand -hex 32   # → paste ke JWT_ACCESS_SECRET di .env
openssl rand -hex 32   # → paste ke JWT_REFRESH_SECRET di .env

# 4. Setup database — bikin user `arise` + database `arise_dev` di airis_postgres
pnpm db:setup
# → prompt password, paste juga ke DATABASE_URL di .env

# 5. Prisma — generate client + first migration
pnpm prisma:generate
pnpm prisma:migrate --name init

# 6. Run dev server
pnpm dev
```

Verify:
- API health: <http://localhost:3000/v1/health>
- Swagger UI: <http://localhost:3000/docs>
- OpenAPI JSON: <http://localhost:3000/openapi.json>

## Common Commands

```bash
pnpm dev                  # NestJS watch mode
pnpm build                # compile ke dist/
pnpm test                 # unit tests (Vitest)
pnpm test:e2e             # e2e endpoint tests
pnpm lint                 # ESLint --fix
pnpm format               # Prettier

pnpm db:setup             # idempotent: user + db di airis_postgres
pnpm prisma:generate      # regen Prisma client (after schema change)
pnpm prisma:migrate       # buat + run migration (dev)
pnpm prisma:studio        # GUI buat browse data
pnpm prisma:reset         # NUKE & re-seed (dev only)
```

## Inspecting the DB

`airis_postgres` udah running, akses langsung via:
- **Prisma Studio** (rec): `pnpm prisma:studio` — buka di browser
- **psql via docker exec:**
  ```bash
  docker exec -it airis_postgres psql -U arise -d arise_dev
  ```
- **GUI client di Windows host:**
  - pgAdmin / DbGate / SQLPro → connect ke `localhost:5433`, user `arise`, db `arise_dev`

## API Documentation

OpenAPI spec auto-generated dari NestJS Swagger decorators:
- `/docs` — Swagger UI
- `/openapi.json` — Raw spec

Frontend repos (`arise-mobile`, `arise-web`) consume types via `openapi-typescript`:
```bash
# Di sisi mobile/web:
pnpm gen:types
```

## Project Structure

```
arise-api/
├── claude-rules/             ← Rules untuk Claude (CLAUDE.md, context.md, decisions/, vibing/)
│   └── decisions/
│       ├── 0001-dev-docker-stack.md           (Superseded)
│       └── 0002-reuse-existing-postgres.md    (Accepted)
├── scripts/
│   ├── bootstrap-wsl.sh      ← Install Node + pnpm di WSL
│   └── setup-db.sh           ← Create user + db di airis_postgres
├── prisma/
│   ├── schema.prisma         ← Skeleton baseline (User model only)
│   └── migrations/           ← Generated (di-commit)
├── src/
│   ├── common/
│   │   ├── filters/          ← RFC 7807 problem+json
│   │   └── prisma/           ← PrismaService (global, UUID v7 extension)
│   ├── config/
│   │   └── env.ts            ← zod env schema + validator
│   ├── modules/
│   │   └── health/           ← /v1/health (proof of life)
│   │   # ── tambah module per sprint (auth, users, profiles, ...) ──
│   ├── app.module.ts
│   └── main.ts               ← Bootstrap (Swagger, ValidationPipe, ProblemJsonFilter)
├── test/                     ← e2e tests
├── Dockerfile                ← Production image (multi-stage)
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Phase 1 vs Phase 2 (Infra)

| Concern | Phase 1 (MVP) | Phase 2 |
|---|---|---|
| Queue/Background jobs | `@nestjs/schedule` cron in-process | BullMQ + Redis |
| Email | `MAIL_TRANSPORT=console` (stdout) | SMTP (Resend/Mailgun/Postmark) |
| UUID v7 | Client-side via `uuidv7` lib | (same — portable) |
| Cache | None (or in-memory `cache-manager`) | Redis |

## Reference

- Project docs: `../docs/`
- Database schema (full): `../docs/03-database-schema.md`
- PRD: `../docs/02-spec-prd.md`
- Roadmap: `../docs/05-roadmap-mvp.md`
- Project rules (Claude): `claude-rules/CLAUDE.md`
- Repo decisions log: `claude-rules/decisions/`

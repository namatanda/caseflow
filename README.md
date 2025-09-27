# CourtFlow Backend Service

CourtFlow Backend is a TypeScript-powered Express API that backs the CourtFlow performance dashboard. It delivers secure REST endpoints, orchestrates PostgreSQL data via Prisma, manages Redis-backed caching and sessions, and ships with first-class observability (structured logging, health probes, Prometheus metrics) plus hardened security middleware.

---

## Contents
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running Locally](#running-locally)
- [Architecture Overview](#architecture-overview)
- [Development Workflow](#development-workflow)
  - [Quality Gates](#quality-gates)
  - [Frequently Used Scripts](#frequently-used-scripts)
- [Environment Configuration](#environment-configuration)
- [Data Layer (PostgreSQL + Prisma)](#data-layer-postgresql--prisma)
- [Caching & Sessions (Redis)](#caching--sessions-redis)
- [Health & Observability](#health--observability)
- [Security](#security)
- [Background Jobs](#background-jobs)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Getting Started

### Prerequisites
- Node.js **>= 18** (see `package.json` engines field)
- npm **>= 9**
- Docker & Docker Compose (optional, for local infrastructure)
- PostgreSQL and Redis instances (local or via Docker)

### Installation
```bash
# install dependencies
npm install

# (optional) launch postgres + redis
docker compose up -d

# copy and adjust env vars
cp .env.example .env.local   # if template exists
```
> If `.env.example` is absent, create `.env.local` manually using the variables listed in [Environment Configuration](#environment-configuration).

### Running Locally
```bash
# start API with hot reload
npm run dev

# curl the base probe
curl http://localhost:3001/health
```
The service listens on the `PORT` value (defaults to **3001**). Versioned REST routes live under `/api/v1`.

---

## Architecture Overview
- **Runtime**: Express.js + TypeScript (strict lint + typecheck gates)
- **Database**: PostgreSQL managed via Prisma Client
- **Caching / Sessions**: Redis with dedicated clients for general cache, sessions, and background processing
- **Queues**: BullMQ built on Redis
- **Observability**: Prometheus metrics, rich health checks, Winston-based structured logging
- **Testing**: Vitest suites spanning configuration, controllers, middleware, routes, and utilities

---

## Development Workflow

### Quality Gates
Run these before opening a PR (recommended order: lint → typecheck → tests):
```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
```

### Frequently Used Scripts
```bash
npm run dev            # start dev server (tsx)
npm run build          # compile TypeScript + tsc-alias
npm run lint:fix       # apply lint autofixes
npm run test:watch     # interactive test watcher
npm run test:coverage  # coverage report
npm run db:generate    # prisma client generation
npm run migrate:dev    # run prisma migration (development)
npm run db:seed:dev    # populate development seed data
```
Additional migration/seed scripts exist for staging and production environments (`migrate:*`, `db:seed:*`).

---

## Environment Configuration
Create `.env.local` (or set shell variables) with at least:
```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/courtflow_db"
DIRECT_DATABASE_URL="postgresql://username:password@localhost:5432/courtflow_db"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-at-least-32-characters-long"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# Application
NODE_ENV="development"
PORT=3001
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:9002"
```
> Production deployments should provide secure values via a secrets manager or environment-specific configuration system.

---

## Data Layer (PostgreSQL + Prisma)
- Connection pooling, retry logic, and health diagnostics baked in
- Transaction helpers with retry-on-deadlock semantics
- Automated migration scripts (`migrate:*`) and generation (`db:generate`)
- Core models include `Court`, `Judge`, `Case`, `CaseActivity`, `User`, `DailyImportBatch`

---

## Caching & Sessions (Redis)
- Three clients: main, session, and cache
- Cache manager supports get/set, batch operations, pattern invalidation, TTL control, and atomic counters
- Session manager handles creation, retrieval (with last-accessed updates), partial updates, TTL extension, and cleanup
- Disconnect helpers ensure graceful shutdown pathways

---

## Health & Observability
- Structured logging via Winston (JSON formatting, correlation IDs)
- Prometheus metrics exposed via `register.metrics()`
- Health checker gathers database, Redis, memory, disk, and response-time diagnostics
- Key endpoints:
  - `GET /health` – lightweight process probe
  - `GET /api/system/health` – quick health summary for load balancers
  - `GET /api/system/health/detailed` – dependency deep dive
  - `GET /api/system/metrics` – Prometheus exposition
  - `GET /api/system/version` – build + environment metadata

---

## Security
- Helmet-based security headers (CSP, HSTS, frameguard, referrer policy, etc.)
- Deep sanitization of `query`, `params`, and `body` payloads to strip HTML/script injections
- IP whitelist helper, request size limiter, and differentiated rate limiters (auth, upload, create, search, general)
- JWT auth middleware with typed payloads and refresh-token helpers
- Prisma parameter binding guards against SQL injection; Redis clients support AUTH/TLS and namespace isolation

---

## Background Jobs
- BullMQ drives asynchronous workflows backed by Redis
- Configure dedicated queues/workers as new domain features emerge (see `bullmq` usage in the codebase)

---

## Troubleshooting
1. **Database connection issues** – verify `DATABASE_URL`, database availability, and connection pool sizing
2. **Redis connection issues** – confirm `REDIS_URL`, Redis process status, and ACL/auth configuration
3. **Performance concerns** – inspect Prometheus metrics, Redis hit rates, and database query performance

Handy commands:
```bash
npm run db:studio                     # Prisma Studio for DB exploration
npm run dev                           # watch logs in dev mode
curl http://localhost:3001/api/system/health/detailed
```

---

## Contributing
1. Create a topic branch from `main`
2. Run lint, typecheck, and tests locally
3. Add/extend Vitest suites for new functionality
4. Document configuration or behavioural changes in this README
5. Open a PR describing the change, validation steps, and rollout considerations
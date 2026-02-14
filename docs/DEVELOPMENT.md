# BuildCraft AI - Development Guide

Complete guide for setting up, developing, testing, and deploying BuildCraft AI.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Project Structure](#project-structure)
4. [Environment Variables](#environment-variables)
5. [Development Workflow](#development-workflow)
6. [Database Management](#database-management)
7. [Running Services](#running-services)
8. [Testing](#testing)
9. [Building for Production](#building-for-production)
10. [Code Conventions](#code-conventions)
11. [Monorepo Commands](#monorepo-commands)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool         | Version   | Purpose                              |
|--------------|-----------|--------------------------------------|
| Node.js      | >= 20.0.0 | JavaScript runtime                   |
| npm          | >= 10.0.0 | Package manager                      |
| Docker       | >= 24.0   | Container runtime                    |
| Docker Compose | >= 2.0  | Multi-container orchestration        |
| Git          | >= 2.40   | Version control                      |

**Optional:**
| Tool         | Purpose                                       |
|--------------|-----------------------------------------------|
| kubectl      | Kubernetes deployment                         |
| PostgreSQL client (`psql`) | Direct database access           |
| Redis CLI    | Direct Redis access                           |

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url> buildcraft-ai
cd buildcraft-ai

# 2. Install all dependencies (including workspace packages)
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env — at minimum set:
#   OPENAI_API_KEY=sk-...       (or)
#   ANTHROPIC_API_KEY=sk-ant-...
#   JWT_SECRET=<random-32-char-string>

# 4. Start infrastructure (PostgreSQL, Redis, MinIO)
docker-compose -f infrastructure/docker/docker-compose.yml up -d postgres redis minio minio-init

# 5. Wait for services to be healthy
docker-compose -f infrastructure/docker/docker-compose.yml ps
# Ensure postgres, redis, minio show "healthy"

# 6. Run database migrations
npm run db:migrate

# 7. Start development servers
npm run dev
# This starts:
#   Backend  → http://localhost:4000
#   Frontend → http://localhost:3000
```

**Access Points:**
| Service       | URL                              |
|---------------|----------------------------------|
| Frontend      | http://localhost:3000             |
| Backend API   | http://localhost:4000/api/v1     |
| Health Check  | http://localhost:4000/api/v1/health |
| MinIO Console | http://localhost:9001             |
| Bull Board    | http://localhost:4001             |
| Grafana       | http://localhost:3001             |

---

## Project Structure

```
buildcraft-ai/
├── .env.example                  # Environment variable template
├── .env                          # Local environment (gitignored)
├── package.json                  # Root workspace config
├── turbo.json                    # Turborepo pipeline config
├── tsconfig.base.json            # Shared TypeScript config
│
├── packages/
│   ├── backend/                  # Express.js API server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── api/              # HTTP layer
│   │       │   ├── controllers/  # Request handlers
│   │       │   ├── middlewares/  # Auth, validation, errors
│   │       │   ├── routes/       # Route definitions
│   │       │   └── validators/   # Zod schemas
│   │       ├── core/             # Framework-agnostic core
│   │       │   ├── config/       # Environment config (Zod)
│   │       │   ├── errors/       # Custom error classes
│   │       │   ├── events/       # Distributed event bus
│   │       │   ├── logger/       # Winston logger
│   │       │   └── utils/        # Helper functions
│   │       ├── infrastructure/   # External integrations
│   │       │   ├── database/     # PostgreSQL + Knex
│   │       │   │   ├── connection.ts
│   │       │   │   ├── migrations/
│   │       │   │   └── repositories/
│   │       │   ├── queue/        # BullMQ queues + workers
│   │       │   ├── storage/      # S3/MinIO storage
│   │       │   └── websocket/    # Socket.IO
│   │       ├── patterns/         # Enterprise patterns
│   │       │   ├── circuit-breaker/
│   │       │   ├── cqrs/
│   │       │   ├── rate-limiter/
│   │       │   └── retry/
│   │       └── services/         # Business logic
│   │           ├── ai/
│   │           ├── auth/
│   │           ├── chat/
│   │           ├── collaboration/
│   │           ├── deployment/
│   │           ├── notification/
│   │           └── project/
│   │
│   ├── frontend/                 # Next.js application
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   └── src/
│   │       ├── app/              # Pages (App Router)
│   │       ├── components/       # UI + feature components
│   │       ├── lib/              # API, stores, hooks, utils
│   │       └── types/            # TypeScript types
│   │
│   └── shared/                   # Shared types + utils
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types/            # Shared type definitions
│           ├── constants/        # App constants + limits
│           ├── validators/       # Shared validation
│           └── utils/            # Shared utilities
│
├── infrastructure/
│   ├── docker/
│   │   ├── docker-compose.yml    # Full service stack
│   │   ├── Dockerfile.backend    # Backend image
│   │   └── Dockerfile.frontend   # Frontend image
│   ├── k8s/
│   │   └── base/                 # Kubernetes manifests
│   └── monitoring/
│       ├── prometheus/
│       └── grafana/
│
└── docs/                         # Documentation
    ├── ARCHITECTURE.md
    ├── API.md
    ├── DATABASE.md
    ├── SERVICES.md
    ├── INFRASTRUCTURE.md
    ├── FRONTEND.md
    ├── SECURITY.md
    └── DEVELOPMENT.md (this file)
```

---

## Environment Variables

### Required Variables

| Variable            | Example                    | Description                    |
|---------------------|----------------------------|--------------------------------|
| `JWT_SECRET`        | `my-super-secret-key-32ch` | JWT signing secret (change!)   |
| `AI_PROVIDER`       | `openai`                   | `openai` or `anthropic`        |
| `OPENAI_API_KEY`    | `sk-...`                   | OpenAI API key                 |
| `ANTHROPIC_API_KEY` | `sk-ant-...`               | Anthropic API key              |

### Optional Variables (with defaults)

| Variable                  | Default                            | Description                     |
|---------------------------|------------------------------------|---------------------------------|
| `NODE_ENV`                | `development`                      | Environment                     |
| `BACKEND_PORT`            | `4000`                             | API server port                 |
| `BACKEND_HOST`            | `0.0.0.0`                          | API server host                 |
| `DATABASE_URL`            | `postgresql://buildcraft:buildcraft@localhost:5432/buildcraft` | PostgreSQL connection |
| `DATABASE_HOST`           | `localhost`                        | DB host                         |
| `DATABASE_PORT`           | `5432`                             | DB port                         |
| `DATABASE_USER`           | `buildcraft`                       | DB user                         |
| `DATABASE_PASSWORD`       | `buildcraft`                       | DB password                     |
| `DATABASE_NAME`           | `buildcraft`                       | DB name                         |
| `REDIS_URL`               | `redis://localhost:6379`           | Redis connection                |
| `JWT_EXPIRES_IN`          | `7d`                               | Access token expiry             |
| `JWT_REFRESH_EXPIRES_IN`  | `30d`                              | Refresh token expiry            |
| `STORAGE_PROVIDER`        | `local`                            | `local` or `s3`                 |
| `S3_BUCKET`               | `buildcraft-storage`               | S3 bucket name                  |
| `S3_ENDPOINT`             | —                                  | MinIO endpoint                  |
| `CORS_ORIGINS`            | `http://localhost:3000`            | Allowed CORS origins            |
| `LOG_LEVEL`               | `debug`                            | `error/warn/info/debug`         |
| `RATE_LIMIT_WINDOW_MS`    | `900000`                           | Rate limit window (15 min)      |
| `RATE_LIMIT_MAX_REQUESTS` | `100`                              | Max requests per window         |
| `AI_RATE_LIMIT_MAX_REQUESTS` | `20`                            | Max AI requests per window      |
| `SANDBOX_MAX_MEMORY`      | `256m`                             | Sandbox memory limit            |
| `SANDBOX_MAX_CPUS`        | `0.5`                              | Sandbox CPU limit               |
| `SANDBOX_TIMEOUT_MS`      | `300000`                           | Sandbox auto-kill (5 min)       |

### Frontend Variables

| Variable                  | Default                           | Description                     |
|---------------------------|-----------------------------------|---------------------------------|
| `NEXT_PUBLIC_API_URL`     | `http://localhost:4000/api/v1`    | Backend API URL                 |
| `NEXT_PUBLIC_WS_URL`      | `ws://localhost:4000`             | WebSocket URL                   |
| `NEXT_PUBLIC_APP_URL`     | `http://localhost:3000`           | Frontend app URL                |

---

## Development Workflow

### Starting Development

```bash
# Start everything (backend + frontend in parallel)
npm run dev

# Or start individually
npm run dev:backend    # Backend only (port 4000)
npm run dev:frontend   # Frontend only (port 3000)
```

### Hot Reloading

- **Backend:** Uses `tsx watch` — auto-restarts on `.ts` file changes
- **Frontend:** Uses Next.js fast refresh — updates without full page reload

### Code Formatting

```bash
# Format all files
npm run format

# Lint all files
npm run lint

# Lint with auto-fix
npm run lint:fix

# Type checking
npm run typecheck
```

### Pre-commit Hooks

Husky + lint-staged runs automatically on `git commit`:
- `*.{ts,tsx,js,jsx}` → `eslint --fix` + `prettier --write`
- `*.{json,css,md}` → `prettier --write`

---

## Database Management

### Running Migrations

```bash
# Run all pending migrations
npm run db:migrate

# Or directly with knex
cd packages/backend
npx knex migrate:latest

# Rollback the last batch
npx knex migrate:rollback

# Rollback all
npx knex migrate:rollback --all

# Check migration status
npx knex migrate:status

# Create a new migration
npx knex migrate:make <migration_name>
```

### Seeding Data

```bash
npm run db:seed
```

### Direct Database Access

```bash
# Via Docker
docker exec -it <postgres-container> psql -U buildcraft -d buildcraft

# Via psql (if installed locally)
psql postgresql://buildcraft:buildcraft@localhost:5432/buildcraft
```

### Useful Queries

```sql
-- List all tables
\dt

-- Check user count
SELECT COUNT(*) FROM users;

-- View recent generation jobs
SELECT id, status, model, tokens_used, cost, duration_ms
FROM generation_jobs
ORDER BY created_at DESC LIMIT 10;

-- Check active sessions
SELECT u.email, s.device_name, s.last_active_at
FROM user_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.is_revoked = false AND s.expires_at > NOW();

-- View project files
SELECT path, language, size_bytes, version
FROM project_files
WHERE project_id = '<uuid>'
ORDER BY path;
```

---

## Running Services

### Full Docker Stack

```bash
# Start everything (all 10 services)
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# Start only infrastructure (DB, cache, storage)
docker-compose -f infrastructure/docker/docker-compose.yml up -d postgres redis minio minio-init

# View logs
docker-compose -f infrastructure/docker/docker-compose.yml logs -f backend worker

# Restart a single service
docker-compose -f infrastructure/docker/docker-compose.yml restart backend

# Stop everything
docker-compose -f infrastructure/docker/docker-compose.yml down

# Stop and destroy volumes (CAUTION: deletes all data)
docker-compose -f infrastructure/docker/docker-compose.yml down -v
```

### Service Health

```bash
# Check all services
docker-compose -f infrastructure/docker/docker-compose.yml ps

# Backend health
curl http://localhost:4000/api/v1/health

# Detailed health with system info
curl http://localhost:4000/api/v1/health/detailed

# Redis ping
docker exec -it <redis-container> redis-cli ping

# PostgreSQL ready
docker exec -it <postgres-container> pg_isready -U buildcraft
```

---

## Testing

```bash
# Run all tests
npm run test

# Run backend tests only
npm run test:backend

# Run frontend tests only
npm run test:frontend

# Run with coverage
cd packages/backend && npx vitest --coverage

# Run specific test file
cd packages/backend && npx vitest src/services/auth/__tests__/auth.test.ts

# Watch mode
cd packages/backend && npx vitest --watch
```

**Test Framework:** Vitest (backend), Jest (frontend)
**HTTP Testing:** Supertest
**Coverage:** c8 / istanbul

---

## Building for Production

### Local Build

```bash
# Build all packages
npm run build

# Build individually
npm run build:backend    # TypeScript → dist/
npm run build:frontend   # Next.js → .next/

# Type check without building
npm run typecheck
```

### Docker Build

```bash
# Build backend image
docker build -t buildcraft/backend -f infrastructure/docker/Dockerfile.backend .

# Build frontend image
docker build -t buildcraft/frontend -f infrastructure/docker/Dockerfile.frontend .

# Build and start everything
docker-compose -f infrastructure/docker/docker-compose.yml up -d --build
```

---

## Code Conventions

### TypeScript

- Strict mode enabled (`strict: true`)
- No unused locals or parameters
- No fallthrough in switch statements
- Checked indexed access
- Target: ES2022

### File Naming

| Type             | Convention              | Example                        |
|------------------|-------------------------|--------------------------------|
| Components       | PascalCase              | `ChatPanel.tsx`                |
| Services         | camelCase + `.service`  | `auth.service.ts`              |
| Repositories     | camelCase + `.repository` | `user.repository.ts`         |
| Routes           | kebab-case              | `auth.ts`, `projects.ts`      |
| Migrations       | `NNN_description`       | `001_initial_schema.ts`        |
| Types            | PascalCase interfaces   | `User`, `Project`, `ChatMessage` |

### Architecture Layers

```
Routes → Controllers → Services → Repositories → Database
                         ↕
                    Event Bus
                         ↕
                 Queues → Workers
```

- **Routes:** Define HTTP endpoints, apply middleware
- **Controllers:** Extract request data, call services, format responses
- **Services:** Business logic, authorization, event publishing
- **Repositories:** Database queries, data mapping
- **Workers:** Async job processing (AI, deployment, sandbox)

### Error Handling

- Services throw domain errors (`NotFoundError`, `AuthenticationError`, etc.)
- Controllers don't catch errors — they bubble up
- Global error handler middleware formats all errors consistently
- All errors include `requestId` for tracing

---

## Monorepo Commands

All commands defined in root `package.json`:

| Command              | Description                                    |
|----------------------|------------------------------------------------|
| `npm run dev`        | Start backend + frontend concurrently          |
| `npm run dev:backend`| Start backend only with hot reload             |
| `npm run dev:frontend`| Start frontend only with fast refresh         |
| `npm run build`      | Build all packages via Turborepo               |
| `npm run test`       | Run all tests                                  |
| `npm run lint`       | Lint all packages                              |
| `npm run lint:fix`   | Lint + auto-fix                                |
| `npm run format`     | Prettier format all files                      |
| `npm run typecheck`  | TypeScript type checking                       |
| `npm run clean`      | Remove all dist/, .next/, node_modules/        |
| `npm run db:migrate` | Run database migrations                        |
| `npm run db:seed`    | Seed database                                  |
| `npm run docker:up`  | Start Docker Compose                           |
| `npm run docker:down`| Stop Docker Compose                            |

---

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Find process on port 4000
lsof -i :4000
# Kill it
kill -9 <PID>
```

**Database connection refused:**
```bash
# Ensure PostgreSQL is running
docker-compose -f infrastructure/docker/docker-compose.yml up -d postgres
# Wait for health check
docker-compose -f infrastructure/docker/docker-compose.yml ps
```

**Redis connection refused:**
```bash
docker-compose -f infrastructure/docker/docker-compose.yml up -d redis
```

**Migrations failed:**
```bash
# Check migration status
cd packages/backend && npx knex migrate:status
# Rollback and retry
cd packages/backend && npx knex migrate:rollback && npx knex migrate:latest
```

**npm install fails:**
```bash
# Clear cache and retry
rm -rf node_modules packages/*/node_modules
npm cache clean --force
npm install
```

**TypeScript errors after pulling:**
```bash
# Rebuild shared types
npm run build -w packages/shared
```

**Docker build fails:**
```bash
# Clean Docker cache
docker system prune -f
docker-compose -f infrastructure/docker/docker-compose.yml build --no-cache
```

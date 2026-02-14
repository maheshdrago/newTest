# BuildCraft AI - Architecture Documentation

## Overview

BuildCraft AI is an enterprise-grade AI-powered application builder (Lovable clone) that enables users to describe applications in natural language and receive production-ready generated code. The platform features real-time collaboration, live preview via Docker sandboxes, one-click deployment, version snapshots, and multi-model AI support.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Next.js 14 (App Router)                      │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │  │
│  │  │ Landing  │ │   Auth   │ │ Dashboard │ │   Editor   │  │  │
│  │  │  Page    │ │  Pages   │ │   Pages   │ │   Page     │  │  │
│  │  └──────────┘ └──────────┘ └───────────┘ └────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Shared: Zustand Stores | API Client | Socket.IO    │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────┬───────────────┘
                         │ HTTPS                  │ WSS (Socket.IO)
┌────────────────────────┴────────────────────────┴───────────────┐
│                       API Gateway                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Express.js Backend                           │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Middleware: Auth | Validation | Error | Rate Limit  │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │  │
│  │  │  Auth    │ │ Project  │ │ Generate  │ │  Deploy    │  │  │
│  │  │ Routes   │ │ Routes   │ │  Routes   │ │  Routes    │  │  │
│  │  └──────────┘ └──────────┘ └───────────┘ └────────────┘  │  │
│  │              Returns 202 + Job ID (async)                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────────┬───────────────────────┘
       │                                  │
       ▼                                  ▼
┌──────────────────┐            ┌──────────────────────────────┐
│   Redis          │            │   BullMQ Job Queues          │
│  ┌────────────┐  │            │  ┌────────────────────────┐  │
│  │ Pub/Sub    │◄─┼────────────┼──│ code-generation queue  │  │
│  │ Event Bus  │  │            │  │ deployment queue       │  │
│  ├────────────┤  │            │  │ sandbox-execution queue│  │
│  │ Socket.IO  │  │            │  │ notification queue     │  │
│  │ Adapter    │  │            │  └───────────┬────────────┘  │
│  ├────────────┤  │            └──────────────┼───────────────┘
│  │ Cache      │  │                           │
│  └────────────┘  │                           ▼
└──────────────────┘            ┌──────────────────────────────┐
                                │   BullMQ Workers             │
                                │  ┌────────────────────────┐  │
                                │  │ Code Gen Worker        │──┼──► OpenAI / Anthropic
                                │  │  - Calls AI APIs       │  │
                                │  │  - Parses file output  │  │
                                │  │  - Saves to DB         │  │
                                │  ├────────────────────────┤  │
                                │  │ Deployment Worker      │──┼──► Docker Build & Run
                                │  │  - Writes files        │  │
                                │  │  - docker build/run    │  │
                                │  │  - Returns live URL    │  │
                                │  ├────────────────────────┤  │
                                │  │ Sandbox Worker         │──┼──► Isolated Container
                                │  │  - Resource limits     │  │
                                │  │  - Network isolation   │  │
                                │  │  - Auto-cleanup        │  │
                                │  └────────────────────────┘  │
                                └──────────────────────────────┘
                                               │
┌──────────────────────────────────────────────┼───────────────┐
│                  Data / Storage Layer         │               │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┴─┐            │
│  │ PostgreSQL │ │   MinIO    │ │    Docker     │            │
│  │  (Knex)    │ │   (S3)    │ │   Sandbox    │            │
│  │            │ │            │ │   Network    │            │
│  │ - users    │ │ - project  │ │              │            │
│  │ - projects │ │   files    │ │ - read-only  │            │
│  │ - files    │ │ - build    │ │ - 256MB mem  │            │
│  │ - snapshots│ │   artifacts│ │ - 0.5 CPU    │            │
│  │ - jobs     │ │            │ │ - no-new-priv│            │
│  │ - deploys  │ │            │ │ - cap-drop   │            │
│  │ - audits   │ │            │ │ - auto-kill  │            │
│  └────────────┘ └────────────┘ └──────────────┘            │
└──────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer           | Technology                            |
|---------------- |---------------------------------------|
| Frontend        | Next.js 14, React 18, TailwindCSS     |
| State           | Zustand                               |
| Backend         | Express.js, TypeScript                |
| Database        | PostgreSQL + Knex ORM                 |
| Cache/Pub-Sub   | Redis (events, cache, Socket.IO, BullMQ) |
| Job Queue       | BullMQ (code gen, deploy, sandbox)    |
| Real-time       | Socket.IO + Redis Adapter             |
| AI              | OpenAI GPT-4, Anthropic Claude        |
| Object Storage  | MinIO (S3-compatible)                 |
| Auth            | JWT (access + refresh tokens), bcrypt |
| Validation      | Zod                                   |
| Sandbox         | Docker containers (isolated network)  |
| Monorepo        | Turborepo, npm workspaces             |
| Containers      | Docker, docker-compose                |
| Orchestration   | Kubernetes (base manifests)           |
| Monitoring      | Prometheus, Grafana, Bull Board       |

## How Redis is Used (4 roles)

Redis serves as the backbone for distributed operations:

1. **Pub/Sub Event Bus** — `DistributedEventBus` publishes domain events to `buildcraft:events:*` channels. All server instances subscribe and receive events cross-instance.
2. **BullMQ Queue Backend** — All job queues (code generation, deployment, sandbox) are backed by Redis for persistence, retries, and priority scheduling.
3. **Socket.IO Adapter** — `@socket.io/redis-adapter` enables WebSocket rooms/broadcasting across multiple backend instances behind a load balancer.
4. **Cache** — General-purpose caching for API responses and session data.

## Async Job Processing

All long-running operations are processed asynchronously via BullMQ:

```
Client                  API Server              Redis/BullMQ          Worker
  │                        │                        │                   │
  │  POST /generate        │                        │                   │
  │───────────────────────>│                        │                   │
  │                        │  Create job record      │                   │
  │                        │  in PostgreSQL          │                   │
  │                        │                        │                   │
  │                        │  Enqueue to BullMQ     │                   │
  │                        │───────────────────────>│                   │
  │                        │                        │                   │
  │  202 { jobId }         │                        │                   │
  │<───────────────────────│                        │                   │
  │                        │                        │  Dequeue job      │
  │                        │                        │──────────────────>│
  │                        │                        │                   │
  │                        │                        │  Call AI API      │
  │                        │                        │  Parse response   │
  │                        │                        │  Save files to DB │
  │                        │                        │                   │
  │                        │  Redis pub/sub event   │                   │
  │                        │<───────────────────────│<──────────────────│
  │                        │                        │                   │
  │  WebSocket: gen-done   │                        │                   │
  │<═══════════════════════│                        │                   │
```

## Docker Sandbox Architecture

User-generated code runs in isolated Docker containers:

```
┌────────────────────────────────────────────┐
│           buildcraft-sandbox network       │
│              (internal: true)              │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  sandbox-{id}                        │  │
│  │  ┌──────────────────────────────┐    │  │
│  │  │  node:20-alpine              │    │  │
│  │  │  User: sandbox (non-root)    │    │  │
│  │  │  --read-only                 │    │  │
│  │  │  --memory=256m               │    │  │
│  │  │  --cpus=0.5                  │    │  │
│  │  │  --cap-drop=ALL              │    │  │
│  │  │  --security-opt=no-new-priv  │    │  │
│  │  │  tmpfs /tmp (noexec, 64m)    │    │  │
│  │  │                              │    │  │
│  │  │  Port 3000 → random host     │    │  │
│  │  └──────────────────────────────┘    │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  Auto-cleanup after 5 minutes              │
└────────────────────────────────────────────┘
```

Security constraints:
- **read-only filesystem** — only `/tmp` is writable
- **256MB memory limit** — prevents resource exhaustion
- **0.5 CPU cap** — fair scheduling
- **all capabilities dropped** — minimal kernel access
- **no privilege escalation** — `no-new-privileges` seccomp
- **internal network** — no internet access from sandbox
- **non-root user** — runs as `sandbox:1001`
- **auto-cleanup** — containers killed after timeout

## Database Schema (Knex Migrations)

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐
│    users     │     │    projects      │     │   project_files    │
│──────────────│     │──────────────────│     │────────────────────│
│ id (uuid PK) │◄────│ owner_id (FK)    │◄────│ project_id (FK)    │
│ email        │     │ id (uuid PK)     │     │ id (uuid PK)       │
│ password_hash│     │ name             │     │ path               │
│ name         │     │ description      │     │ content            │
│ role         │     │ framework        │     │ language           │
│ plan         │     │ status           │     │ checksum (sha256)  │
│ preferences  │     │ visibility       │     │ size_bytes         │
│ last_login_at│     │ current_version  │     │ version            │
│ created_at   │     │ settings (jsonb) │     │ UNIQUE(project,    │
│ updated_at   │     │ metadata (jsonb) │     │   path, version)   │
└──────────────┘     │ created_at       │     └────────────────────┘
                     │ updated_at       │
                     └──────────────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
┌──────────────────┐ ┌──────────────┐ ┌────────────────┐
│project_snapshots │ │ deployments  │ │generation_jobs │
│──────────────────│ │──────────────│ │────────────────│
│ id (uuid PK)     │ │ id (uuid PK) │ │ id (uuid PK)   │
│ project_id (FK)  │ │ project_id   │ │ project_id     │
│ version          │ │ version      │ │ user_id        │
│ label            │ │ status       │ │ prompt         │
│ description      │ │ url          │ │ model          │
│ created_by (FK)  │ │ container_id │ │ provider       │
│ file_manifest    │ │ build_logs   │ │ status         │
│ UNIQUE(project,  │ │ environment  │ │ result (jsonb) │
│   version)       │ │ started_at   │ │ tokens_used    │
└──────────────────┘ │ completed_at │ │ cost           │
                     └──────────────┘ │ duration_ms    │
                                      └────────────────┘

┌──────────────────┐
│   audit_logs     │
│──────────────────│
│ id (uuid PK)     │
│ user_id (FK)     │
│ action           │
│ resource_type    │
│ resource_id      │
│ details (jsonb)  │
│ ip_address       │
│ user_agent       │
│ created_at       │
└──────────────────┘
```

## API Endpoints

### Auth
| Method | Path                | Description          |
|--------|---------------------|----------------------|
| POST   | /auth/register      | Create account       |
| POST   | /auth/login         | Login                |
| POST   | /auth/refresh       | Refresh access token |

### Projects
| Method | Path                                         | Description                    |
|--------|----------------------------------------------|--------------------------------|
| POST   | /projects                                    | Create project                 |
| GET    | /projects                                    | List user's projects           |
| GET    | /projects/:id                                | Get project with files         |
| PATCH  | /projects/:id                                | Update project metadata        |
| DELETE | /projects/:id                                | Delete project                 |
| POST   | /projects/:id/generate                       | Queue AI generation (202)      |
| POST   | /projects/:id/sandbox                        | Launch sandbox preview (202)   |
| POST   | /projects/:id/snapshots                      | Create version snapshot        |
| GET    | /projects/:id/snapshots                      | List version history           |
| POST   | /projects/:id/snapshots/:version/restore     | Restore to version             |
| POST   | /projects/:id/deploy                         | Queue deployment (202)         |
| GET    | /projects/:id/deployments                    | List deployments               |
| POST   | /projects/:id/deployments/:id/rollback       | Rollback deployment            |

### Health
| Method | Path    | Description             |
|--------|---------|-------------------------|
| GET    | /health | Liveness + readiness    |

## WebSocket Events (Socket.IO)

### Client → Server
| Event          | Payload                                    |
|----------------|--------------------------------------------|
| join-project   | projectId                                  |
| leave-project  | projectId                                  |
| file-change    | { projectId, path, content, cursor }       |
| cursor-move    | { projectId, path, position }              |
| chat-message   | { projectId, content }                     |

### Server → Client (via event bus forwarding)
| Event               | Payload                                     |
|---------------------|---------------------------------------------|
| user-joined         | { userId, userName, socketId }              |
| user-left           | { userId }                                  |
| file-changed        | { path, content, userId }                   |
| cursor-moved        | { path, position, userId }                  |
| generation-started  | { jobId, projectId }                        |
| generation-completed| { jobId, filesChanged, tokensUsed }         |
| generation-failed   | { jobId, error }                            |
| deployment-completed| { deploymentId, url }                       |
| deployment-failed   | { deploymentId, error }                     |
| sandbox-ready       | { sandboxId, url, port }                    |

## Enterprise Resilience Patterns

### Circuit Breaker
Protects against cascading failures with AI providers:
- CLOSED → OPEN after 5 consecutive failures
- OPEN → HALF_OPEN after 30s recovery timeout
- HALF_OPEN → CLOSED after 3 successful requests

### Retry with Exponential Backoff
Handles transient failures (network timeouts, rate limits):
- Max 3 attempts, 2s base delay, exponential backoff with jitter

### Token Bucket Rate Limiter
Per-user API request limiting:
- 100 requests per 15-minute window (general)
- 20 requests per window (AI generation)

### CQRS
Commands (write) and Queries (read) separated for independent optimization.

## Docker Compose Services

| Service     | Port(s)     | Description                                    |
|-------------|-------------|------------------------------------------------|
| postgres    | 5432        | PostgreSQL 16 with Knex migrations             |
| redis       | 6379        | Redis 7 (pub/sub, BullMQ, Socket.IO, cache)   |
| minio       | 9000, 9001  | S3-compatible object storage + console         |
| backend     | 4000, 9090  | Express API + metrics endpoint                 |
| worker      | —           | BullMQ workers (code gen, deploy, sandbox)     |
| bull-board  | 4001        | Queue monitoring dashboard                     |
| frontend    | 3000        | Next.js application                            |
| prometheus  | 9091        | Metrics collection                             |
| grafana     | 3001        | Monitoring dashboards                          |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env
# Edit .env with your OpenAI/Anthropic API keys

# 3. Start all infrastructure
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# 4. Run database migrations
cd packages/backend && npx knex migrate:latest

# 5. Run development servers
npx turbo dev
```

## Networks

- **buildcraft-net** — Main network connecting all services
- **buildcraft-sandbox** — Internal-only network for sandbox containers (no external access)

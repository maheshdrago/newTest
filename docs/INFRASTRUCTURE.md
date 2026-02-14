# BuildCraft AI - Infrastructure Documentation

Complete documentation of Docker, job queues, event bus, storage, WebSocket, and Kubernetes infrastructure.

---

## Table of Contents

1. [Docker Compose Environment](#docker-compose-environment)
2. [Docker Images](#docker-images)
3. [BullMQ Job Queues](#bullmq-job-queues)
4. [Workers](#workers)
5. [Redis Event Bus](#redis-event-bus)
6. [WebSocket (Socket.IO)](#websocket-socketio)
7. [Object Storage (S3/MinIO)](#object-storage-s3minio)
8. [Docker Sandbox Execution](#docker-sandbox-execution)
9. [Kubernetes Deployment](#kubernetes-deployment)
10. [Monitoring Stack](#monitoring-stack)
11. [Network Architecture](#network-architecture)

---

## Docker Compose Environment

**File:** `infrastructure/docker/docker-compose.yml`

### Services Overview

| Service       | Image                          | Port(s)          | Purpose                                      |
|---------------|--------------------------------|------------------|----------------------------------------------|
| `postgres`    | `postgres:16-alpine`           | `5432`           | Primary database                             |
| `redis`       | `redis:7-alpine`               | `6379`           | Cache, pub/sub, queues, Socket.IO adapter    |
| `minio`       | `minio/minio:latest`           | `9000`, `9001`   | S3-compatible object storage                 |
| `minio-init`  | `minio/mc:latest`              | —                | One-shot bucket initialization               |
| `backend`     | `buildcraft/backend`           | `4000`, `9090`   | Express API server                           |
| `worker`      | `buildcraft/backend`           | —                | BullMQ job processors                        |
| `bull-board`  | `deadly0/bull-board:latest`    | `4001`           | Queue monitoring dashboard                   |
| `frontend`    | `buildcraft/frontend`          | `3000`           | Next.js web application                      |
| `prometheus`  | `prom/prometheus:latest`       | `9091`           | Metrics collection                           |
| `grafana`     | `grafana/grafana:latest`       | `3001`           | Monitoring dashboards                        |

### Service Details

#### PostgreSQL

```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_DB: buildcraft
    POSTGRES_USER: buildcraft
    POSTGRES_PASSWORD: buildcraft
  ports: ["5432:5432"]
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U buildcraft"]
    interval: 10s
    timeout: 5s
    retries: 5
```

- Persistent volume: `postgres_data`
- Health check: `pg_isready` every 10s
- Init script runs on first start

---

#### Redis

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru --appendonly yes
  ports: ["6379:6379"]
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

**Redis serves 4 distinct roles:**

| Role                | Channel/Key Pattern           | Used By                    |
|---------------------|-------------------------------|----------------------------|
| Pub/Sub Event Bus   | `buildcraft:events:*`         | DistributedEventBus        |
| BullMQ Queue Backend| `bull:*`                      | All 4 queues + 3 workers   |
| Socket.IO Adapter   | `socket.io#*`                 | WebSocketManager           |
| General Cache       | Application-defined keys      | Various services           |

**Configuration:**
- 512MB max memory with LRU eviction
- AOF persistence enabled (data survives restarts)
- Persistent volume: `redis_data`

---

#### MinIO (S3 Storage)

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: buildcraft
    MINIO_ROOT_PASSWORD: buildcraft-secret
  ports:
    - "9000:9000"   # S3 API
    - "9001:9001"   # Web Console
  volumes:
    - minio_data:/data
```

**Buckets (created by `minio-init`):**
- `buildcraft-storage` — Project files, user uploads
- `buildcraft-artifacts` — Build artifacts, deployment packages

---

#### Backend

```yaml
backend:
  build:
    context: ../..
    dockerfile: infrastructure/docker/Dockerfile.backend
  ports:
    - "4000:4000"    # API
    - "9090:9090"    # Prometheus metrics
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  depends_on:
    postgres: { condition: service_healthy }
    redis: { condition: service_healthy }
    minio: { condition: service_healthy }
```

**Key:** Mounts the Docker socket (`/var/run/docker.sock`) to enable sandbox container creation from within the backend container.

---

#### Worker

```yaml
worker:
  build:
    context: ../..
    dockerfile: infrastructure/docker/Dockerfile.backend
  command: ["node", "dist/workers/start.js"]
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  environment:
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
```

Same image as backend but runs workers instead of the API server. Also mounts Docker socket for deployment and sandbox workers.

---

### Starting the Environment

```bash
# Start all services
docker-compose -f infrastructure/docker/docker-compose.yml up -d

# Check service health
docker-compose -f infrastructure/docker/docker-compose.yml ps

# View logs for a specific service
docker-compose -f infrastructure/docker/docker-compose.yml logs -f backend

# Stop all services
docker-compose -f infrastructure/docker/docker-compose.yml down

# Stop and remove all data (volumes)
docker-compose -f infrastructure/docker/docker-compose.yml down -v
```

---

## Docker Images

### Dockerfile.backend

**File:** `infrastructure/docker/Dockerfile.backend`

Multi-stage build for the Express.js backend:

```
Stage 1: builder (node:20-alpine)
├── Install dependencies (npm ci)
├── Copy shared + backend source
├── Build TypeScript → dist/
└── Output: node_modules + dist

Stage 2: runner (node:20-alpine)
├── Create non-root user (buildcraft, UID 1001)
├── Copy node_modules + dist from builder
├── Expose 4000 (API) + 9090 (metrics)
├── Health check: wget /api/v1/health
└── CMD: node dist/index.js
```

**Security:** Runs as non-root user. Multi-stage minimizes image size.

---

### Dockerfile.frontend

**File:** `infrastructure/docker/Dockerfile.frontend`

Three-stage build for the Next.js frontend:

```
Stage 1: deps (node:20-alpine)
├── Install dependencies (npm ci)
└── Output: node_modules

Stage 2: builder (node:20-alpine)
├── Copy source code
├── Disable telemetry (NEXT_TELEMETRY_DISABLED=1)
├── Build Next.js → .next/
└── Output: .next/standalone + .next/static

Stage 3: runner (node:20-alpine)
├── Create non-root user (buildcraft, UID 1001)
├── Copy standalone + static
├── Expose 3000
└── CMD: node packages/frontend/server.js
```

---

## BullMQ Job Queues

**Connection:** `packages/backend/src/infrastructure/queue/connection.ts`
**Queue Definitions:** `packages/backend/src/infrastructure/queue/queues.ts`

### Queue Configuration

All queues share a common Redis connection with these defaults:

```typescript
{
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400, count: 1000 },  // Keep 24h or 1000 jobs
    removeOnFail: { age: 604800, count: 5000 }       // Keep 7d or 5000 jobs
  }
}
```

### Queue Inventory

| Queue Name              | Concurrency | Purpose                              | Worker File                         |
|-------------------------|-------------|--------------------------------------|-------------------------------------|
| `code-generation`       | 2           | AI code generation via OpenAI/Claude | `workers/code-generation.worker.ts` |
| `deployment`            | 1           | Docker build and deploy              | `workers/deployment.worker.ts`      |
| `sandbox-execution`     | 3           | Isolated preview containers          | `workers/sandbox.worker.ts`         |
| `notification`          | —           | Async notification delivery          | *(No dedicated worker yet)*         |

### Worker Configuration

Workers are created with:
```typescript
{
  concurrency: <per-queue>,
  limiter: {
    max: 10,       // Max 10 jobs
    duration: 1000  // Per second
  }
}
```

### Queue Monitoring

Bull Board is available at `http://localhost:4001` for real-time queue monitoring:
- Active/waiting/completed/failed job counts
- Job details and payloads
- Retry/remove individual jobs
- Queue throughput metrics

---

## Workers

### Code Generation Worker

**File:** `packages/backend/src/infrastructure/queue/workers/code-generation.worker.ts`

**Job Data:**
```typescript
{
  jobId: string;
  projectId: string;
  userId: string;
  prompt: string;
  model: string;          // "gpt-4", "claude-3-sonnet", etc.
  provider: string;       // "openai" | "anthropic"
  framework: string;      // "nextjs", "react", etc.
  existingFiles: Array<{ path: string; content: string }>;
}
```

**Processing Steps:**
1. Mark job as `processing` (10% progress)
2. Publish `generation.started` event
3. Build system prompt with existing file context
4. Call AI API:
   - **Anthropic:** `claude-sonnet-4-20250514`, 8192 max tokens
   - **OpenAI:** model from job data, temperature 0.7
5. Parse response into file blocks using regex
6. Upsert each file to `project_files` table
7. Mark job as `completed` with metrics (tokens, cost, duration)
8. Publish `generation.completed` event

**AI Response Format:**
```
=== FILE: src/app/page.tsx ===
import React from 'react';
export default function Home() {
  return <div>Hello World</div>;
}
=== END FILE ===

=== FILE: src/app/layout.tsx ===
// ...
=== END FILE ===
```

**Cost Calculation:**
| Model         | Input $/1K tokens | Output $/1K tokens |
|---------------|--------------------|--------------------|
| gpt-4         | $0.03              | $0.06              |
| gpt-4-turbo   | $0.01              | $0.03              |
| gpt-4o        | $0.005             | $0.015             |
| claude-sonnet | $0.003             | $0.015             |
| claude-opus   | $0.015             | $0.075             |

---

### Deployment Worker

**File:** `packages/backend/src/infrastructure/queue/workers/deployment.worker.ts`

**Job Data:**
```typescript
{
  deploymentId: string;
  projectId: string;
  userId: string;
  version: number;
  environment: Record<string, string>;
}
```

**Processing Steps:**
1. Update deployment status to `building` (10%)
2. Fetch project files from database (20%)
3. Write files to `/tmp/buildcraft/deploy-{deploymentId}` (30%)
4. Generate Dockerfile based on framework (40%):
   - **Next.js:** Multi-stage Node.js build
   - **React:** Multi-stage with Nginx for static files
5. `docker build -t buildcraft-app-{projectId}:v{version}` (70%)
6. `docker run -d` with environment variables (85%)
7. Get container port mapping (95%)
8. Update deployment to `live` with URL
9. Publish `deployment.completed` event

---

### Sandbox Worker

**File:** `packages/backend/src/infrastructure/queue/workers/sandbox.worker.ts`

**Job Data:**
```typescript
{
  sandboxId: string;
  projectId: string;
  files: Array<{ path: string; content: string }>;
  framework: string;
  command?: string;
}
```

**Processing Steps:**
1. Create filesystem at `/tmp/buildcraft/sandbox/{sandboxId}` (10%)
2. Write project files (20%)
3. Generate `package.json` if missing (30%)
4. Generate `Dockerfile.sandbox` and build image (60%)
5. Run container with security restrictions (80%)
6. Get port mapping (90%)
7. Set auto-cleanup timer (5 minutes)

**Container Security Flags:**
```bash
docker run -d \
  --name sandbox-{sandboxId} \
  --memory=256m \
  --cpus=0.5 \
  --read-only \
  --tmpfs /tmp:noexec,size=64m \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --network=buildcraft-sandbox \
  -p 0:3000 \
  sandbox-{sandboxId}
```

**Auto-cleanup:** Timer kills and removes the container after 5 minutes.

---

## Redis Event Bus

**File:** `packages/backend/src/core/events/index.ts`

### Architecture

The `DistributedEventBus` extends Node.js `EventEmitter` with Redis pub/sub for cross-instance communication.

```
┌──────────────┐                    ┌──────────────┐
│  Instance A  │                    │  Instance B  │
│              │                    │              │
│  publish() ──┼──► Redis Channel ──┼──► handler() │
│              │   buildcraft:      │              │
│  handler() ◄─┼──  events:*     ◄──┼── publish() │
└──────────────┘                    └──────────────┘
```

### Event Deduplication

Each instance has a unique `instanceId`. Events include the source instance ID. When receiving events from Redis, the bus checks if the event originated from itself and skips re-processing to prevent loops.

### Event Types

```typescript
const EventTypes = {
  // Project events
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',
  PROJECT_DEPLOYED: 'project.deployed',

  // AI events
  AI_GENERATION_STARTED: 'ai.generation.started',
  AI_GENERATION_COMPLETED: 'ai.generation.completed',
  AI_GENERATION_FAILED: 'ai.generation.failed',

  // User events
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged_in',
  USER_PLAN_UPGRADED: 'user.plan_upgraded',

  // Collaboration events
  COLLABORATION_SESSION_STARTED: 'collaboration.session_started',
  COLLABORATION_USER_JOINED: 'collaboration.user_joined',
  COLLABORATION_USER_LEFT: 'collaboration.user_left',

  // System events
  CIRCUIT_BREAKER_OPENED: 'system.circuit_breaker_opened',
  CIRCUIT_BREAKER_CLOSED: 'system.circuit_breaker_closed',
  HEALTH_CHECK_FAILED: 'system.health_check_failed',
};
```

### Event Interface

```typescript
interface DomainEvent {
  type: string;
  payload: Record<string, any>;
  timestamp: Date;
  source?: string;  // instanceId of publisher
}
```

### Usage

```typescript
// Publish
await eventBus.publish({
  type: EventTypes.PROJECT_CREATED,
  payload: { projectId: 'uuid', userId: 'uuid' },
  timestamp: new Date(),
});

// Subscribe
eventBus.subscribe(EventTypes.PROJECT_CREATED, (event) => {
  console.log('Project created:', event.payload.projectId);
});
```

### Fallback

If Redis is unavailable, the event bus falls back to **local-only mode** (regular EventEmitter). Events are only visible within the current process.

---

## WebSocket (Socket.IO)

**File:** `packages/backend/src/infrastructure/websocket/index.ts`

### Configuration

```typescript
const io = new Server(httpServer, {
  cors: { origin: config.CORS_ORIGINS?.split(',') },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 20000,
});
```

### Redis Adapter

For horizontal scaling across multiple backend instances, Socket.IO uses `@socket.io/redis-adapter`:

```
Client A ──► Backend 1 ──► Redis Adapter ──► Backend 2 ──► Client B
                              (pub/sub)
```

All `emit()` calls are replicated across instances via Redis, ensuring all clients in a room receive events regardless of which backend instance they're connected to.

### Authentication

Connection middleware validates JWT from the `auth` handshake parameter:
```javascript
// Client
const socket = io('ws://localhost:4000', {
  auth: { token: 'Bearer eyJhbGci...' }
});
```

Invalid tokens are rejected with a `connection_error` event.

### Rooms

| Room Pattern       | Purpose                               |
|--------------------|---------------------------------------|
| `project:{id}`     | All users editing a project           |
| `user:{id}`        | Personal notifications for a user     |

### Event Bus Forwarding

The WebSocketManager subscribes to event bus events and forwards them to Socket.IO rooms:

| Event Bus Event           | Socket.IO Event         | Target Room          |
|---------------------------|-------------------------|----------------------|
| `generation.started`      | `generation-started`    | `project:{id}`       |
| `generation.completed`    | `generation-completed`  | `project:{id}`       |
| `generation.failed`       | `generation-failed`     | `project:{id}`       |
| `deployment.completed`    | `deployment-completed`  | `project:{id}`       |
| `deployment.failed`       | `deployment-failed`     | `project:{id}`       |
| `sandbox.ready`           | `sandbox-ready`         | `project:{id}`       |

---

## Object Storage (S3/MinIO)

**File:** `packages/backend/src/infrastructure/storage/index.ts`

### Provider Interface

```typescript
interface StorageProvider {
  put(file: StorageFile): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}
```

### S3StorageProvider

Works with AWS S3, MinIO, or any S3-compatible service.

**Configuration:**
| Env Var                    | Description                    | Default               |
|----------------------------|--------------------------------|-----------------------|
| `S3_BUCKET`                | Bucket name                    | `buildcraft-storage`  |
| `S3_REGION`                | AWS region                     | `us-east-1`           |
| `S3_ENDPOINT`              | Custom endpoint (MinIO)        | —                     |
| `AWS_ACCESS_KEY_ID`        | Access key                     | —                     |
| `AWS_SECRET_ACCESS_KEY`    | Secret key                     | —                     |

**Features:**
- `forcePathStyle: true` for MinIO compatibility
- Signed URL generation with configurable expiry (default 1 hour)
- Supports `contentType` and `metadata` per file

### LocalStorageProvider

Fallback for development — stores files on local disk at `{cwd}/storage/`.

**Selection:** `STORAGE_PROVIDER=s3` → S3, `STORAGE_PROVIDER=local` (or default) → LocalStorage.

---

## Docker Sandbox Execution

### Network Isolation

```yaml
networks:
  buildcraft-sandbox:
    internal: true    # No external network access
```

Sandbox containers run on an **internal-only** Docker network with no internet access. This prevents:
- Exfiltration of data
- Downloading malicious packages
- Attacking external services

### Container Security Profile

| Security Measure              | Flag/Setting                              | Purpose                     |
|-------------------------------|-------------------------------------------|-----------------------------|
| Memory limit                  | `--memory=256m`                           | Prevent resource exhaustion |
| CPU limit                     | `--cpus=0.5`                              | Fair scheduling             |
| Read-only filesystem          | `--read-only`                             | Prevent persistent writes   |
| Writable tmp                  | `--tmpfs /tmp:noexec,size=64m`            | Limited scratch space       |
| Drop all capabilities         | `--cap-drop=ALL`                          | Minimal kernel access       |
| No privilege escalation       | `--security-opt=no-new-privileges`        | Block setuid/setgid         |
| Non-root user                 | `USER sandbox` (UID 1001)                 | Least privilege             |
| Network isolation             | `--network=buildcraft-sandbox`            | No internet access          |
| Auto-cleanup                  | Timer: 5 minutes                          | Resource reclamation        |

### Lifecycle

```
1. Write files → /tmp/buildcraft/sandbox/{id}/
2. Build image → sandbox-{id}
3. Run container with security flags
4. Get random host port → return sandbox URL
5. After 5 minutes → docker kill + docker rm
6. Cleanup temp files
```

---

## Kubernetes Deployment

### Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: buildcraft
  labels:
    app: buildcraft
    environment: base
```

### Backend Deployment

**File:** `infrastructure/k8s/base/backend-deployment.yaml`

| Setting              | Value                          |
|----------------------|--------------------------------|
| Replicas             | 3 (min), 20 (max via HPA)     |
| CPU request/limit    | 250m / 1000m                   |
| Memory request/limit | 512Mi / 1Gi                    |
| Readiness probe      | GET /api/v1/ready, 10s period  |
| Liveness probe       | GET /api/v1/health, 30s period |
| Startup probe        | GET /api/v1/health, 10s period, 30 failures allowed |
| Update strategy      | Rolling: maxSurge 1, maxUnavailable 0 |

**Horizontal Pod Autoscaler:**
| Metric             | Target | Scale Up            | Scale Down          |
|--------------------|--------|---------------------|---------------------|
| CPU utilization    | 70%    | +2 pods per 60s     | -1 pod per 120s     |
| Memory utilization | 80%    | +2 pods per 60s     | Stabilization: 300s |

### Frontend Deployment

**File:** `infrastructure/k8s/base/frontend-deployment.yaml`

| Setting              | Value                |
|----------------------|----------------------|
| Replicas             | 2                    |
| CPU request/limit    | 100m / 500m          |
| Memory request/limit | 256Mi / 512Mi        |
| Readiness probe      | GET /, 10s period    |

### Ingress

```yaml
spec:
  tls:
    - hosts: [buildcraft.app, api.buildcraft.app]
      secretName: buildcraft-tls
  rules:
    - host: buildcraft.app
      http:
        paths:
          - path: /
            backend: buildcraft-frontend:3000
    - host: api.buildcraft.app
      http:
        paths:
          - path: /
            backend: buildcraft-backend:4000
```

**Annotations:**
- SSL redirect: enabled
- Max body size: 10m
- WebSocket support for backend
- cert-manager for automatic TLS via Let's Encrypt

---

## Monitoring Stack

### Prometheus

**Port:** `9091`
**Config:** `infrastructure/monitoring/prometheus/prometheus.yml`

Scrapes metrics from:
- Backend API (port 9090)
- Worker processes
- Redis exporter
- PostgreSQL exporter

### Grafana

**Port:** `3001`
**Default Login:** admin / admin
**Dashboards:** `infrastructure/monitoring/grafana/dashboards/`

Pre-configured dashboards for:
- API request rates and latencies
- Queue depths and processing times
- Database connection pool stats
- AI generation metrics (tokens, costs, success rates)
- Container resource utilization

---

## Network Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  buildcraft-net (bridge)                 │
│                                                          │
│  ┌──────────┐  ┌───────┐  ┌───────┐  ┌──────────────┐  │
│  │ frontend │  │backend│  │worker │  │  bull-board   │  │
│  │  :3000   │  │ :4000 │  │       │  │   :4001      │  │
│  └──────────┘  └───┬───┘  └───┬───┘  └──────────────┘  │
│                    │          │                           │
│  ┌──────────┐  ┌───┴──┐  ┌───┴──┐  ┌──────────────┐    │
│  │prometheus │  │redis │  │postgres  │   minio      │    │
│  │  :9091   │  │:6379 │  │ :5432│  │  :9000/:9001 │    │
│  └──────────┘  └──────┘  └──────┘  └──────────────┘    │
│                                                          │
│  ┌──────────┐                                           │
│  │ grafana  │                                           │
│  │  :3001   │                                           │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│           buildcraft-sandbox (internal: true)             │
│                    No external access                     │
│                                                          │
│  ┌────────────────┐  ┌────────────────┐                  │
│  │ sandbox-abc123 │  │ sandbox-def456 │  ...             │
│  │  (port 3000)   │  │  (port 3000)   │                  │
│  └────────────────┘  └────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

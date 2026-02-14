# BuildCraft AI - API Reference

Complete REST API documentation for the BuildCraft AI backend server.

**Base URL:** `http://localhost:4000/api/v1`

**Authentication:** All endpoints (except `/auth/*` and `/health/*`) require a valid JWT in the `Authorization` header:
```
Authorization: Bearer <access_token>
```

**Response Format:**
All responses follow a consistent envelope:
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "requestId": "req_abc123def456",
    "timestamp": "2026-02-14T00:00:00.000Z"
  }
}
```

**Error Response Format:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... },
    "stack": "(only in development)"
  },
  "meta": {
    "requestId": "req_abc123def456",
    "timestamp": "2026-02-14T00:00:00.000Z"
  }
}
```

---

## Table of Contents

1. [Authentication](#authentication)
2. [Projects](#projects)
3. [AI Code Generation](#ai-code-generation)
4. [Sandbox Preview](#sandbox-preview)
5. [Snapshots (Version Control)](#snapshots-version-control)
6. [Deployments](#deployments)
7. [Health Checks](#health-checks)
8. [WebSocket Events](#websocket-events)
9. [Error Codes](#error-codes)
10. [Rate Limiting](#rate-limiting)

---

## Authentication

### POST /auth/register

Create a new user account.

**Validation Schema (`registerSchema`):**
| Field      | Type   | Rules                                                                 |
|------------|--------|-----------------------------------------------------------------------|
| `name`     | string | Required. 2–100 characters                                           |
| `email`    | string | Required. Must be valid email format                                  |
| `password` | string | Required. Min 8 chars, must include uppercase, lowercase, number, and special character |

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass1!"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "member",
      "plan": "free"
    },
    "tokens": {
      "accessToken": "eyJhbGci...",
      "refreshToken": "eyJhbGci...",
      "expiresIn": "7d"
    }
  }
}
```

**Side Effects:**
- Password hashed with bcryptjs (salt rounds = 12)
- `USER_REGISTERED` domain event published
- Audit log entry created with IP and user-agent
- Session created in `user_sessions` table (refresh token hashed with SHA-256)

---

### POST /auth/login

Authenticate an existing user.

**Validation Schema (`loginSchema`):**
| Field      | Type   | Rules              |
|------------|--------|--------------------|
| `email`    | string | Required. Valid email |
| `password` | string | Required            |

**Request:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass1!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "member",
      "plan": "free"
    },
    "tokens": {
      "accessToken": "eyJhbGci...",
      "refreshToken": "eyJhbGci...",
      "expiresIn": "7d"
    }
  }
}
```

**Side Effects:**
- `last_login_at` updated on user record
- `USER_LOGGED_IN` domain event published
- Session created in `user_sessions` table

**Errors:**
- `401 AUTHENTICATION_ERROR` — Invalid email or password

---

### POST /auth/refresh

Rotate a refresh token to get new access + refresh tokens.

**Validation Schema (`refreshTokenSchema`):**
| Field          | Type   | Rules    |
|----------------|--------|----------|
| `refreshToken` | string | Required |

**Request:**
```json
{
  "refreshToken": "eyJhbGci..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGci...(new)",
      "refreshToken": "eyJhbGci...(new)",
      "expiresIn": "7d"
    }
  }
}
```

**Security Flow:**
1. Hash the incoming refresh token with SHA-256
2. Look up session by hashed token in `user_sessions`
3. Verify the JWT signature is valid
4. **Revoke** the old session (prevents replay)
5. Create a new session with new refresh token
6. Return new token pair

**Errors:**
- `401 AUTHENTICATION_ERROR` — Invalid or expired refresh token

---

### POST /auth/logout

Revoke the current session's refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGci..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Notes:** If `refreshToken` is not provided, responds with success anyway (idempotent).

---

### POST /auth/logout-all

**Requires Authentication**

Revoke all sessions for the current user across all devices.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "5 sessions revoked"
}
```

---

### GET /auth/sessions

**Requires Authentication**

List all active sessions for device management.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "uuid",
        "device_name": "Chrome on macOS",
        "ip_address": "192.168.1.1",
        "last_active_at": "2026-02-14T10:00:00.000Z",
        "created_at": "2026-02-01T08:00:00.000Z"
      }
    ]
  }
}
```

---

### DELETE /auth/sessions/:sessionId

**Requires Authentication**

Revoke a specific session by its ID (remote device logout).

**Path Parameters:**
| Param       | Type   | Description              |
|-------------|--------|--------------------------|
| `sessionId` | string | UUID of session to revoke |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Session revoked"
}
```

**Errors:**
- `404` — Session not found or not owned by user

---

## Projects

### POST /projects

Create a new project.

**Validation Schema (`createProjectSchema`):**
| Field         | Type   | Rules                                                       |
|---------------|--------|-------------------------------------------------------------|
| `name`        | string | Required. 1–100 chars. Alphanumeric, spaces, hyphens, underscores |
| `description` | string | Required. 1–1000 chars                                      |
| `framework`   | enum   | Required. `react` \| `nextjs` \| `vue` \| `svelte` \| `vanilla` |
| `visibility`  | enum   | Optional. `private` \| `public` \| `team`. Default: `private` |
| `prompt`      | string | Optional. Max 10,000 chars. Initial generation prompt        |

**Request:**
```json
{
  "name": "My App",
  "description": "A task management application",
  "framework": "nextjs",
  "visibility": "private",
  "prompt": "Build a task management app with drag-and-drop boards"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My App",
    "description": "A task management application",
    "framework": "nextjs",
    "status": "draft",
    "visibility": "private",
    "ownerId": "uuid",
    "currentVersion": 1,
    "createdAt": "2026-02-14T00:00:00.000Z",
    "updatedAt": "2026-02-14T00:00:00.000Z"
  }
}
```

**Side Effects:**
- `PROJECT_CREATED` domain event published

---

### GET /projects

List the current user's projects with pagination and filtering.

**Query Parameters (`paginationSchema`):**
| Param       | Type   | Default       | Rules                                        |
|-------------|--------|---------------|----------------------------------------------|
| `page`      | number | `1`           | Min 1                                         |
| `pageSize`  | number | `20`          | 1–100                                         |
| `sortBy`    | enum   | `updatedAt`   | `createdAt` \| `updatedAt` \| `name`         |
| `sortOrder` | enum   | `desc`        | `asc` \| `desc`                               |
| `search`    | string | —             | Full text search on name/description           |
| `framework` | enum   | —             | Filter by framework                            |
| `status`    | enum   | —             | `draft` \| `generating` \| `ready` \| `deploying` \| `deployed` \| `error` \| `archived` |

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "projects": [ ... ],
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

---

### GET /projects/:id

Get a single project with its files.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My App",
    "description": "...",
    "framework": "nextjs",
    "status": "ready",
    "visibility": "private",
    "ownerId": "uuid",
    "currentVersion": 3,
    "files": [
      {
        "id": "uuid",
        "path": "src/app/page.tsx",
        "content": "export default function Home() { ... }",
        "language": "typescript",
        "checksum": "sha256:...",
        "sizeBytes": 1234,
        "version": 3
      }
    ],
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Access Rules:**
- Owner: always allowed
- Public projects: anyone can view
- Private projects: owner only (403 otherwise)

---

### PATCH /projects/:id

Update project metadata. Owner only.

**Validation Schema (`updateProjectSchema`):**
| Field         | Type   | Rules                    |
|---------------|--------|--------------------------|
| `name`        | string | Optional. Same rules     |
| `description` | string | Optional. Same rules     |
| `visibility`  | enum   | Optional. Same rules     |

**Response (200 OK):** Updated project object.

---

### DELETE /projects/:id

Delete a project. Owner only.

**Response (204 No Content):** Empty body.

---

## AI Code Generation

### POST /projects/:id/generate

Queue an AI code generation job. Returns immediately with a job ID — results are delivered via WebSocket.

**Validation Schema (`generateCodeSchema`):**
| Field               | Type    | Rules                                                  |
|---------------------|---------|--------------------------------------------------------|
| `prompt`            | string  | Required. 1–10,000 chars                               |
| `options.model`     | enum    | Optional. `gpt-4` \| `gpt-4-turbo` \| `claude-3-opus` \| `claude-3-sonnet` |
| `options.temperature` | number | Optional. 0–2                                         |
| `options.stream`    | boolean | Optional. Default: `true`                              |

**Request:**
```json
{
  "prompt": "Add a dark mode toggle to the settings page",
  "options": {
    "model": "gpt-4-turbo",
    "temperature": 0.7
  }
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "message": "Code generation queued"
  }
}
```

**Async Processing Flow:**
1. API validates request, creates `generation_jobs` record in DB
2. Job enqueued to `code-generation` BullMQ queue
3. API returns 202 immediately
4. Worker picks up job, calls OpenAI/Anthropic API
5. Worker parses response into file changes
6. Worker saves files to `project_files` table
7. `generation.completed` event published via Redis pub/sub
8. Socket.IO forwards event to client as `generation-completed`

**Usage Limits:**
- Checked against `getUserUsageToday()` — max 100 jobs/day
- Priority: high for users with < 50 daily jobs, normal otherwise

---

## Sandbox Preview

### POST /projects/:id/sandbox

Launch an isolated Docker sandbox for live preview.

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "sandboxId": "uuid",
    "status": "launching"
  }
}
```

**Sandbox Container Specs:**
| Property             | Value                           |
|----------------------|---------------------------------|
| Base Image           | `node:20-alpine`                |
| Memory Limit         | 256 MB                          |
| CPU Limit            | 0.5 cores                       |
| Filesystem           | Read-only (except `/tmp`)       |
| Network              | `buildcraft-sandbox` (internal) |
| User                 | `sandbox` (UID 1001, non-root)  |
| Capabilities         | All dropped (`--cap-drop=ALL`)  |
| Privilege Escalation | Disabled (`--security-opt=no-new-privileges`) |
| Auto-cleanup         | 5 minutes (300,000 ms)          |

**Result delivered via WebSocket:** `sandbox-ready` event with URL and port.

---

## Snapshots (Version Control)

### POST /projects/:id/snapshots

Create a point-in-time snapshot of all project files.

**Request:**
```json
{
  "label": "v1.0 release",
  "description": "Initial release with core features"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "projectId": "uuid",
    "version": 3,
    "label": "v1.0 release",
    "description": "Initial release with core features",
    "createdBy": "uuid",
    "createdAt": "..."
  }
}
```

**How Snapshots Work:**
1. Transaction begins
2. Reads all current-version files from `project_files`
3. Copies each file row with `version = currentVersion + 1`
4. Increments `current_version` on the project
5. Creates `project_snapshots` record with file manifest
6. Transaction commits

---

### GET /projects/:id/snapshots

List all version snapshots for a project, ordered newest first.

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "version": 3,
      "label": "v1.0 release",
      "description": "...",
      "createdBy": "uuid",
      "createdAt": "..."
    }
  ]
}
```

---

### POST /projects/:id/snapshots/:version/restore

Restore the project to a specific snapshot version.

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Restored to version 2"
}
```

---

## Deployments

### POST /projects/:id/deploy

Queue a deployment to build and run the project in Docker.

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "queued",
    "message": "Deployment queued"
  }
}
```

**Deployment Pipeline:**
1. Creates `deployments` record with status `queued`
2. Enqueues to `deployment` BullMQ queue (5s delay, 2 retry attempts)
3. Worker fetches project files from DB
4. Writes files to `/tmp/buildcraft/deploy-{id}`
5. Generates Dockerfile (Next.js = Node build, React = Nginx static)
6. Runs `docker build -t buildcraft-app-{projectId}:v{version}`
7. Runs container with environment variables
8. Updates deployment status to `live` with URL
9. Publishes `deployment.completed` event → WebSocket notification

---

### GET /projects/:id/deployments

List all deployments for a project.

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "version": 3,
      "status": "live",
      "url": "https://abc123.buildcraft.app",
      "containerId": "docker-container-id",
      "startedAt": "...",
      "completedAt": "..."
    }
  ]
}
```

**Deployment Statuses:** `queued` → `building` → `deploying` → `live` | `failed` | `rolled_back`

---

### POST /projects/:id/deployments/:deploymentId/rollback

Rollback to a previous deployment version.

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "id": "uuid (new deployment)",
    "status": "queued",
    "message": "Rollback queued"
  }
}
```

---

## Health Checks

### GET /health

Basic liveness probe. No authentication required.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-14T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

---

### GET /health/detailed

Extended health check with service status and system metrics.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-14T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "services": {
    "ai": {
      "state": "CLOSED",
      "failureCount": 0,
      "successCount": 42
    },
    "websocket": {
      "connected": true,
      "clientCount": 15
    }
  },
  "system": {
    "memory": {
      "rss": "120.50 MB",
      "heapUsed": "85.30 MB",
      "heapTotal": "128.00 MB"
    },
    "pid": 12345,
    "nodeVersion": "v20.10.0"
  }
}
```

---

### GET /ready

Kubernetes readiness probe.

**Response (200 OK):**
```json
{ "status": "ready" }
```

**Response (503 Service Unavailable):**
```json
{ "status": "not_ready" }
```

---

## WebSocket Events

Connect via Socket.IO at `ws://localhost:4000` with JWT auth:
```javascript
const socket = io('ws://localhost:4000', {
  auth: { token: 'Bearer <access_token>' }
});
```

### Client → Server Events

| Event           | Payload                                       | Description                    |
|-----------------|-----------------------------------------------|--------------------------------|
| `join-project`  | `projectId: string`                           | Join project room              |
| `leave-project` | `projectId: string`                           | Leave project room             |
| `file-change`   | `{ projectId, path, content, cursor }`        | Broadcast file edit            |
| `cursor-move`   | `{ projectId, path, position }`               | Share cursor position          |
| `chat-message`  | `{ projectId, content }`                      | Send chat message              |

### Server → Client Events

| Event                   | Payload                                          | Source                 |
|-------------------------|--------------------------------------------------|------------------------|
| `user-joined`           | `{ userId, userName, socketId }`                 | `join-project`         |
| `user-left`             | `{ userId }`                                     | `leave-project`        |
| `file-changed`          | `{ path, content, userId }`                      | `file-change`          |
| `cursor-moved`          | `{ path, position, userId }`                     | `cursor-move`          |
| `generation-started`    | `{ jobId, projectId }`                           | Event bus forwarding   |
| `generation-completed`  | `{ jobId, filesChanged, tokensUsed }`            | Event bus forwarding   |
| `generation-failed`     | `{ jobId, error }`                               | Event bus forwarding   |
| `deployment-completed`  | `{ deploymentId, url }`                          | Event bus forwarding   |
| `deployment-failed`     | `{ deploymentId, error }`                        | Event bus forwarding   |
| `sandbox-ready`         | `{ sandboxId, url, port }`                       | Event bus forwarding   |

---

## Error Codes

| HTTP | Code                      | Description                           |
|------|---------------------------|---------------------------------------|
| 400  | `VALIDATION_ERROR`        | Request body/query failed validation  |
| 401  | `AUTHENTICATION_ERROR`    | Missing, invalid, or expired token    |
| 403  | `AUTHORIZATION_ERROR`     | Insufficient permissions              |
| 404  | `NOT_FOUND`               | Resource does not exist               |
| 409  | `CONFLICT`                | Duplicate resource (e.g., email)      |
| 429  | `RATE_LIMIT_EXCEEDED`     | Too many requests                     |
| 502  | `EXTERNAL_SERVICE_ERROR`  | Upstream service failure              |
| 503  | `AI_PROVIDER_ERROR`       | AI provider unavailable               |

---

## Rate Limiting

All rate limits use sliding window with standard `RateLimit-*` response headers.

| Limiter     | Window   | Max Requests | Scope               | Applied To              |
|-------------|----------|--------------|----------------------|-------------------------|
| Global      | 15 min   | 100          | Per IP               | All endpoints           |
| Auth        | 15 min   | 10           | Per IP               | `/auth/login`, `/auth/register` |
| AI          | 15 min   | 20           | Per user (or IP)     | `/projects/:id/generate` |
| Custom      | Variable | Variable     | Per IP               | Created via `createCustomRateLimiter()` |

**Rate Limit Headers:**
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1707955200
```

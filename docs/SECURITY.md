# BuildCraft AI - Security Documentation

Complete documentation of security measures, authentication flows, authorization, sandboxing, and known considerations.

---

## Table of Contents

1. [Authentication System](#authentication-system)
2. [Authorization & Access Control](#authorization--access-control)
3. [Session Management](#session-management)
4. [Password Security](#password-security)
5. [Input Validation](#input-validation)
6. [Docker Sandbox Security](#docker-sandbox-security)
7. [Network Security](#network-security)
8. [Rate Limiting](#rate-limiting)
9. [Error Handling & Information Leakage](#error-handling--information-leakage)
10. [Audit Logging](#audit-logging)
11. [Resilience Patterns](#resilience-patterns)
12. [Configuration Security](#configuration-security)
13. [Shared Type Validators](#shared-type-validators)
14. [Known Considerations & Roadmap](#known-considerations--roadmap)

---

## Authentication System

### JWT Token Architecture

BuildCraft uses a dual-token JWT system with refresh token rotation:

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  Client  │         │  Backend │         │  Database │
│          │         │          │         │          │
│ Login ───┼────────►│ Verify   │         │          │
│          │         │ password │         │          │
│          │         │    │     │         │          │
│          │         │    ▼     │         │          │
│          │         │ Generate │         │          │
│          │         │ JWT pair │         │          │
│          │         │    │     │         │          │
│          │         │    ├─────┼────────►│ Store    │
│          │         │    │     │         │ session  │
│          │◄────────┼── tokens │         │ (hashed) │
│          │         │          │         │          │
│ API call ┼────────►│ Verify   │         │          │
│ (access) │         │ JWT sig  │         │          │
│          │◄────────┼─ response│         │          │
│          │         │          │         │          │
│ Refresh ─┼────────►│ Verify   │         │          │
│ (token)  │         │ + rotate │         │          │
│          │         │    │     │         │          │
│          │         │    ├─────┼────────►│ Revoke   │
│          │         │    │     │         │ old      │
│          │         │    ├─────┼────────►│ Create   │
│          │         │    │     │         │ new      │
│          │◄────────┼── new    │         │          │
│          │         │  tokens  │         │          │
└──────────┘         └──────────┘         └──────────┘
```

### Token Specifications

| Property          | Access Token                        | Refresh Token                       |
|-------------------|-------------------------------------|-------------------------------------|
| **Purpose**       | API request authentication          | Obtain new access tokens            |
| **Payload**       | `{ userId, email, role }`           | `{ userId, type: 'refresh' }`      |
| **Expiry**        | 7 days (configurable: `JWT_EXPIRES_IN`) | 30 days (configurable: `JWT_REFRESH_EXPIRES_IN`) |
| **Signing**       | `config.JWT_SECRET` (HS256)         | `config.JWT_SECRET` (HS256)         |
| **Storage (client)** | `localStorage.accessToken`       | `localStorage.refreshToken`         |
| **Storage (server)** | Not stored (stateless)            | SHA-256 hash in `user_sessions`     |
| **Rotation**      | New one issued on refresh           | Revoked + new one issued on refresh |

### Refresh Token Rotation

Each refresh token can only be used **once**. When refreshing:

1. Old refresh token → **revoked** (marked `is_revoked = true`)
2. New refresh token → **created** (new session record)
3. Old token replay → rejected (session already revoked)

This limits the window of token theft. If an attacker steals a refresh token and uses it, the legitimate user's next refresh will fail — indicating a compromise.

---

## Authorization & Access Control

### Role-Based Access Control

| Role     | Permissions                                    |
|----------|------------------------------------------------|
| `admin`  | Full access to all resources                   |
| `member` | Own projects, AI generation, deployment        |
| `viewer` | Read-only access to shared projects            |

### Middleware Chain

```
Request → requestContext → authenticate → authorize → controller
              │                │              │
              ▼                ▼              ▼
         Set requestId    Verify JWT     Check role
         Log request      Set userId     (optional)
```

### Resource Ownership

Project operations verify ownership before proceeding:

```typescript
// ProjectService checks ownership
if (project.owner_id !== userId) {
  if (project.visibility === 'private') {
    throw new AuthorizationError('Access denied');
  }
}
```

### Middleware Details

| Middleware      | File                          | Function                         |
|-----------------|-------------------------------|----------------------------------|
| `authenticate`  | `api/middlewares/auth.ts`     | Verify JWT, extract user claims  |
| `authorize`     | `api/middlewares/auth.ts`     | Check user role against allowed roles |
| `optionalAuth`  | `api/middlewares/auth.ts`     | Try to authenticate, continue if fails |

---

## Session Management

### Session Storage

Sessions are stored in the `user_sessions` table with these security properties:

| Property        | Implementation                           |
|-----------------|------------------------------------------|
| Token storage   | SHA-256 hash only (never plaintext)      |
| Token hashing   | `crypto.createHash('sha256')`            |
| Lookup          | Hash incoming token, match `token_hash`  |
| Revocation      | `is_revoked = true` (soft delete)        |
| Expiration      | `expires_at` timestamp checked on lookup |
| Device tracking | `device_name`, `ip_address`, `user_agent`|
| Activity        | `last_active_at` updated on token use    |

### Session Cleanup

The `SessionRepository.cleanupExpired()` method removes:
- Sessions past their `expires_at` timestamp
- Revoked sessions older than 7 days

### Device Management

Users can:
- **GET /auth/sessions** — View all active sessions with device info
- **DELETE /auth/sessions/:id** — Revoke a specific session (remote logout)
- **POST /auth/logout-all** — Revoke all sessions across all devices

---

## Password Security

| Measure         | Implementation                                |
|-----------------|-----------------------------------------------|
| Hashing         | bcryptjs with 12 salt rounds                  |
| Min length      | 8 characters                                  |
| Complexity      | Must include: uppercase, lowercase, number, special character |
| Validation      | Zod schema in `registerSchema`                |
| Timing attacks  | bcrypt.compare() is constant-time             |

### Password Validation (Zod)

```typescript
password: z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain uppercase')
  .regex(/[a-z]/, 'Must contain lowercase')
  .regex(/[0-9]/, 'Must contain number')
  .regex(/[^A-Za-z0-9]/, 'Must contain special character')
```

---

## Input Validation

### Backend Validation

All request input is validated using Zod schemas before reaching service logic.

| Route                  | Validator                  | Validates                     |
|------------------------|----------------------------|-------------------------------|
| POST /auth/register    | `registerSchema`           | name, email, password         |
| POST /auth/login       | `loginSchema`              | email, password               |
| POST /auth/refresh     | `refreshTokenSchema`       | refreshToken                  |
| POST /projects         | `createProjectSchema`      | name, description, framework, visibility, prompt |
| PATCH /projects/:id    | `updateProjectSchema`      | params.id (UUID), name?, description?, visibility? |
| POST /projects/:id/generate | `generateCodeSchema`  | params.id (UUID), prompt, options |
| GET /projects          | `paginationSchema`         | page, pageSize, sortBy, sortOrder, search |

### Validation Middleware

```typescript
// validate() middleware wraps Zod schema
router.post('/register', validate(registerSchema), handler);
```

On validation failure, returns 400 with field-level errors:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "fieldErrors": {
        "password": ["Must contain uppercase letter"]
      }
    }
  }
}
```

### Shared Validators

The `@buildcraft/shared` package provides client-side validators:

| Validator              | Rules                                     |
|------------------------|-------------------------------------------|
| `isValidEmail(email)`  | Regex-based email format check            |
| `isValidPassword(pw)`  | 8+ chars, upper, lower, number, special   |
| `isValidProjectName(n)`| 1-100 chars, alphanumeric/dash/underscore |
| `isValidPrompt(p)`     | 1-10,000 chars                            |
| `sanitizeInput(s)`     | Removes angle brackets, trims whitespace  |

---

## Docker Sandbox Security

User-generated code runs in heavily restricted Docker containers.

### Defense in Depth

```
Layer 1: Network Isolation
├── buildcraft-sandbox network (internal: true)
├── No external internet access
└── No access to main services

Layer 2: Resource Limits
├── Memory: 256MB hard limit (OOM kill)
├── CPU: 0.5 cores (fair scheduling)
└── Disk: 64MB tmpfs only (no persistent writes)

Layer 3: Filesystem Restrictions
├── Read-only root filesystem (--read-only)
├── Only /tmp writable (tmpfs, noexec)
└── No access to host filesystem

Layer 4: Capability Restrictions
├── All Linux capabilities dropped (--cap-drop=ALL)
├── No privilege escalation (--security-opt=no-new-privileges)
└── No setuid/setgid

Layer 5: User Isolation
├── Runs as non-root user (sandbox, UID 1001)
└── No access to privileged operations

Layer 6: Temporal Limits
├── Auto-killed after 5 minutes (300,000 ms)
└── Container removed after kill
```

### Docker Run Command

```bash
docker run -d \
  --name sandbox-{id} \
  --memory=256m \
  --cpus=0.5 \
  --read-only \
  --tmpfs /tmp:noexec,size=64m \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --network=buildcraft-sandbox \
  -p 0:3000 \
  sandbox-{id}
```

### What Sandboxed Code Cannot Do

| Action                           | Blocked By                          |
|----------------------------------|-------------------------------------|
| Access the internet              | Internal-only network               |
| Read host files                  | No volume mounts                    |
| Write to disk permanently        | Read-only FS + tmpfs                |
| Escalate privileges              | cap-drop ALL + no-new-privileges    |
| Fork bomb / memory bomb          | 256MB limit → OOM kill              |
| CPU exhaustion                   | 0.5 CPU cap                         |
| Run indefinitely                 | 5-minute auto-cleanup               |
| Execute binaries in /tmp         | tmpfs noexec flag                   |

---

## Network Security

### Docker Network Topology

```
Internet
    │
    ▼
┌─────────────────────────────────────┐
│         buildcraft-net (bridge)      │
│                                      │
│  frontend ↔ backend ↔ redis         │
│                      ↔ postgres      │
│                      ↔ minio         │
│                      ↔ worker        │
└──────────────────────┬──────────────┘
                       │
              (Docker socket mount)
                       │
                       ▼
┌─────────────────────────────────────┐
│    buildcraft-sandbox (internal)     │
│         NO external access           │
│                                      │
│  sandbox-abc123  sandbox-def456      │
└─────────────────────────────────────┘
```

### CORS Configuration

Backend CORS is configured via `CORS_ORIGINS` environment variable:
```
CORS_ORIGINS=http://localhost:3000,https://buildcraft.app
```

Socket.IO CORS follows the same configuration.

---

## Rate Limiting

### Rate Limiter Configuration

| Limiter     | Window   | Max | Key        | Applied To                      |
|-------------|----------|-----|------------|---------------------------------|
| Global      | 15 min   | 100 | Client IP  | All endpoints                   |
| Auth        | 15 min   | 10  | Client IP  | `/auth/login`, `/auth/register` |
| AI          | 15 min   | 20  | User ID    | `/projects/:id/generate`        |

### Response Headers

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1707955200
```

### Additional Limits

| Limit                    | Value   | Enforced By              |
|--------------------------|---------|--------------------------|
| AI jobs per user per day | 100     | `getUserUsageToday()`    |
| Max prompt length        | 10,000  | Zod validation           |
| Max file size            | 10 MB   | Constants                |
| Max project files        | 500     | Constants                |
| Max project name length  | 100     | Zod validation           |

### Subscription Tier Limits

| Resource             | Free | Pro  | Team | Enterprise |
|----------------------|------|------|------|------------|
| Projects             | 3    | 25   | 100  | Unlimited  |
| AI requests/day      | 10   | 100  | 500  | Unlimited  |
| Collaborators        | 0    | 5    | 25   | Unlimited  |
| Storage              | 50MB | 500MB| 2GB  | Unlimited  |

---

## Error Handling & Information Leakage

### Global Error Handler

**File:** `packages/backend/src/api/middlewares/error-handler.ts`

| Error Type     | HTTP Status | Response                                      |
|----------------|-------------|-----------------------------------------------|
| `ZodError`     | 400         | Field-level validation errors                 |
| `AppError`     | Varies      | Code + message + details (operational errors) |
| Generic Error  | 500         | Generic message in production, details in dev |

### Production Safety

- **5xx errors:** Stack traces hidden, generic "Internal server error" message
- **4xx errors:** Specific error codes and messages (safe to show)
- **All responses:** Include `requestId` for support ticket correlation
- **Logging:** 5xx logged at `error` level, 4xx at `warn` level

---

## Audit Logging

### Audited Actions

| Action           | Resource Type | Trigger                          |
|------------------|---------------|----------------------------------|
| `user.register`  | `user`        | New account creation             |
| `user.login`     | `user`        | Successful login                 |

### Audit Log Fields

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "action": "user.login",
  "resource_type": "user",
  "resource_id": "uuid",
  "details": { "method": "email" },
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "created_at": "2026-02-14T00:00:00.000Z"
}
```

### Querying Audit Logs

```typescript
// By user
const logs = await auditRepo.findByUser(userId, limit);

// By resource
const logs = await auditRepo.findByResource('project', projectId, limit);
```

---

## Resilience Patterns

### Circuit Breaker (AI Provider Protection)

Prevents cascading failures when AI providers are down:

| State     | Behavior                                   | Transition Condition         |
|-----------|--------------------------------------------|------------------------------|
| CLOSED    | Normal operation, requests pass through    | 5 consecutive failures → OPEN |
| OPEN      | All requests rejected immediately          | 30s timeout → HALF_OPEN      |
| HALF_OPEN | Limited requests allowed (testing recovery)| 3 successes → CLOSED          |

### Retry with Exponential Backoff

For transient failures (network timeouts, rate limits):
- Max 3 attempts
- Delays: 1s, 2s+jitter, 4s+jitter
- Cap at 30s
- Optional error type filtering

### Graceful Degradation

When the AI circuit breaker is OPEN, the system can optionally return a fallback response instead of failing entirely.

---

## Configuration Security

### Secrets Management

| Secret               | Environment Variable    | Notes                              |
|----------------------|-------------------------|------------------------------------|
| JWT signing key      | `JWT_SECRET`            | Default: `dev-secret-change-in-production` |
| Database password    | `DATABASE_PASSWORD`     | Default: `buildcraft`             |
| OpenAI API key       | `OPENAI_API_KEY`        | No default                        |
| Anthropic API key    | `ANTHROPIC_API_KEY`     | No default                        |
| S3 access key        | `AWS_ACCESS_KEY_ID`     | Default: `buildcraft`            |
| S3 secret key        | `AWS_SECRET_ACCESS_KEY` | Default: `buildcraft-secret`     |
| MinIO root password  | `MINIO_ROOT_PASSWORD`   | Default: `buildcraft-secret`     |

### Production Checklist

- [ ] Change `JWT_SECRET` to a cryptographically random 256-bit key
- [ ] Change all default database passwords
- [ ] Set `NODE_ENV=production`
- [ ] Use external secret management (AWS Secrets Manager, Vault, etc.)
- [ ] Enable TLS/SSL on all external endpoints
- [ ] Set restrictive CORS origins
- [ ] Review and restrict rate limits
- [ ] Enable Kubernetes network policies
- [ ] Configure Prometheus alerts
- [ ] Set up log aggregation (ELK, Datadog, etc.)

---

## Shared Type Validators

**File:** `packages/shared/src/validators/index.ts`

These validators are available for both frontend (client-side) and backend (server-side) validation:

```typescript
validators.isValidEmail('user@example.com')     // true
validators.isValidPassword('Secure1!')           // { valid: true, errors: [] }
validators.isValidProjectName('My App')          // true
validators.isValidPrompt('Build a todo app')     // true
validators.sanitizeInput('<script>alert(1)</script>') // 'scriptalert(1)/script'
```

---

## Known Considerations & Roadmap

### Current Considerations

| Area                    | Status                                    | Notes                                            |
|-------------------------|-------------------------------------------|--------------------------------------------------|
| CSRF protection         | Not implemented                           | Consider csurf middleware for state-changing ops  |
| Helmet security headers | In package.json but not applied           | Add `app.use(helmet())` to Express app           |
| File path validation    | Paths joined without traversal checks     | Add `path.normalize()` + `path.relative()` checks |
| Notification persistence| Service queues but no DB table            | Add `notifications` migration                    |
| Session cleanup cron    | `cleanupExpired()` exists but not scheduled | Add cron job or BullMQ repeatable job          |
| API key redaction       | Keys used directly in workers             | Ensure API keys never appear in logs             |
| WebSocket per-event auth| Auth on connection only                   | Add project ownership checks on events           |
| Request body size limit | Not explicitly configured                 | Add `express.json({ limit: '10mb' })`           |
| `express-async-errors`  | In package.json, may not be imported      | Verify import at app entry point                 |
| Docker command injection| Image names from user-controlled IDs      | Sanitize all Docker command parameters           |

### Security Improvement Roadmap

**Phase 1 — Critical:**
1. Apply Helmet security headers
2. Add CSRF middleware
3. Validate file paths against directory traversal
4. Add `express-async-errors` import verification
5. Add request body size limits

**Phase 2 — Important:**
6. Add notification persistence table
7. Schedule session cleanup cron
8. Add WebSocket per-event authorization
9. Redact API keys from all log outputs
10. Sanitize Docker command parameters

**Phase 3 — Hardening:**
11. Add Content Security Policy headers
12. Implement request signing for inter-service communication
13. Add database query logging for security audit
14. Implement IP-based session validation
15. Add brute-force detection and account lockout

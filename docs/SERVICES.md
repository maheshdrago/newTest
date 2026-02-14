# BuildCraft AI - Services & Business Logic Documentation

Complete reference for all backend services, their responsibilities, methods, dependencies, and interactions.

---

## Table of Contents

1. [Service Architecture Overview](#service-architecture-overview)
2. [AuthService](#authservice)
3. [ProjectService](#projectservice)
4. [AIService](#aiservice)
5. [ChatService](#chatservice)
6. [DeploymentService](#deploymentservice)
7. [CollaborationService](#collaborationservice)
8. [NotificationService](#notificationservice)
9. [Enterprise Patterns](#enterprise-patterns)

---

## Service Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Routes)                       │
│  auth.ts  │  projects.ts  │  health.ts                      │
└─────┬─────┴───────┬───────┴─────────────────────────────────┘
      │             │
      ▼             ▼
┌───────────┐  ┌──────────────┐  ┌──────────────┐
│AuthService│  │ProjectService│  │DeployService │
│           │  │              │  │              │
│ register  │  │ create       │  │ deploy       │
│ login     │  │ getById      │  │ rollback     │
│ refresh   │  │ list         │  │ getLive      │
│ logout    │  │ update       │  │              │
│ logoutAll │  │ delete       │  └──────┬───────┘
│ sessions  │  │ generateCode │         │
└─────┬─────┘  │ launchSandbox│         │
      │        │ snapshots    │         │
      │        └──────┬───────┘         │
      │               │                 │
      ▼               ▼                 ▼
┌───────────────────────────────────────────────────────┐
│              Infrastructure Layer                      │
│                                                        │
│  ┌───────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │Repositories│  │BullMQ    │  │Redis Event Bus   │   │
│  │(PostgreSQL)│  │Queues    │  │(Pub/Sub)         │   │
│  └───────────┘  └──────────┘  └──────────────────┘   │
│                                                        │
│  ┌───────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │Storage    │  │WebSocket │  │Workers           │   │
│  │(S3/MinIO) │  │(Socket.IO│  │(BullMQ)          │   │
│  └───────────┘  └──────────┘  └──────────────────┘   │
└────────────────────────────────────────────────────────┘
```

Each service is a singleton class instantiated at module load. Services depend on repositories (database), queues (async processing), and the event bus (cross-service communication).

---

## AuthService

**File:** `packages/backend/src/services/auth/auth.service.ts`
**Singleton:** `authService`

### Dependencies

| Dependency          | Purpose                                       |
|---------------------|-----------------------------------------------|
| `UserRepository`    | User CRUD and lookup by email                 |
| `SessionRepository` | JWT session persistence, token hashing        |
| `AuditRepository`   | Security audit logging                        |
| `config`            | JWT secret, token expiry settings             |
| `eventBus`          | Publishes user lifecycle events               |
| `bcryptjs`          | Password hashing (12 salt rounds)             |
| `jsonwebtoken`      | JWT signing and verification                  |

### Methods

#### `register(name, email, password, meta?)`

Creates a new user account with hashed password.

**Parameters:**
| Param     | Type                              | Description                 |
|-----------|-----------------------------------|-----------------------------|
| `name`    | `string`                          | User display name           |
| `email`   | `string`                          | Login email (must be unique)|
| `password`| `string`                          | Plaintext password          |
| `meta`    | `{ ip?: string; userAgent?: string }` | Client metadata         |

**Flow:**
1. Check if email already exists → throw `ConflictError` if yes
2. Hash password with bcryptjs (12 rounds)
3. Create user record in DB
4. Publish `USER_REGISTERED` event
5. Log audit entry: `user.register`
6. Create session (generates JWT tokens)
7. Return `{ user, tokens }`

**Returns:** `{ user: { id, name, email, role, plan }, tokens: { accessToken, refreshToken, expiresIn } }`

---

#### `login(email, password, meta?)`

Authenticates a user with email/password.

**Flow:**
1. Look up user by email → throw `AuthenticationError` if not found
2. Compare password with stored hash → throw `AuthenticationError` if mismatch
3. Update `last_login_at` timestamp
4. Publish `USER_LOGGED_IN` event
5. Create session (generates JWT tokens)
6. Return `{ user, tokens }`

---

#### `refreshToken(refreshToken)`

Rotates a refresh token — revokes the old one, creates a new session.

**Flow:**
1. Hash incoming token with SHA-256
2. Look up session by token hash (must be valid, not expired, not revoked)
3. Verify JWT signature → throw `AuthenticationError` if invalid
4. **Revoke** the old session (prevents token replay)
5. Look up user by session's `user_id`
6. Create new session with fresh tokens
7. Return new token pair

**Security:** This implements **refresh token rotation** — each token can only be used once. If a revoked token is reused, it indicates a potential token theft.

---

#### `logout(refreshToken)`

Revokes a single session by its refresh token.

---

#### `logoutAll(userId)`

Revokes all sessions for a user across all devices. Returns count of revoked sessions.

---

#### `getActiveSessions(userId)`

Lists all non-revoked, non-expired sessions for device management UI.

**Returns:** `Array<{ id, deviceName, ipAddress, lastActiveAt, createdAt }>`

---

#### `revokeSession(sessionId, userId)`

Revokes a specific session by ID. Verifies the session belongs to the requesting user.

---

#### `createSession(user, meta?)` (Private)

Internal method that generates JWT tokens and persists the session.

**Token Generation:**
- **Access Token:** Signed with `config.JWT_SECRET`, contains `{ userId, email, role }`, expires per `config.JWT_EXPIRES_IN` (default: 7d)
- **Refresh Token:** Signed with `config.JWT_SECRET`, contains `{ userId, type: 'refresh' }`, expires per `config.JWT_REFRESH_EXPIRES_IN` (default: 30d)

**Expiry Parsing:** Parses duration strings like `"30d"`, `"7d"`, `"24h"` into milliseconds for DB `expires_at`.

---

## ProjectService

**File:** `packages/backend/src/services/project/project.service.ts`
**Singleton:** `projectService`

### Dependencies

| Dependency                | Purpose                                         |
|---------------------------|-------------------------------------------------|
| `ProjectRepository`       | Project and file CRUD, snapshots                |
| `GenerationJobRepository` | AI job tracking and usage limits                |
| `codeGenerationQueue`     | Enqueue AI generation jobs                      |
| `sandboxExecutionQueue`   | Enqueue sandbox preview jobs                    |
| `eventBus`                | Publishes project lifecycle events              |

### Methods

#### `create(ownerId, data)`

Creates a new project with `draft` status.

**Parameters:**
| Param                | Type     | Description                      |
|----------------------|----------|----------------------------------|
| `data.name`          | `string` | Project name                     |
| `data.description`   | `string` | Project description              |
| `data.framework`     | `string` | Target framework                 |
| `data.visibility`    | `string` | Optional, defaults to `private`  |

**Side Effects:** Publishes `PROJECT_CREATED` event.

---

#### `getById(projectId, userId)`

Retrieves a project with its files, enforcing visibility/permission rules.

**Access Control:**
- Owner: always allowed
- Public visibility: anyone can view
- Private visibility: owner only → throws `AuthorizationError`

---

#### `list(userId, params)`

Paginated project listing for the current user.

**Parameters:**
| Param          | Type     | Default       | Description              |
|----------------|----------|---------------|--------------------------|
| `page`         | `number` | `1`           | Page number              |
| `pageSize`     | `number` | `20`          | Items per page           |
| `sortBy`       | `string` | `updatedAt`   | Sort field               |
| `sortOrder`    | `string` | `desc`        | Sort direction           |

**Returns:** `{ projects, total, page, pageSize, hasMore }`

---

#### `update(projectId, userId, data)`

Updates project metadata. Verifies ownership first.

**Side Effects:** Publishes `PROJECT_UPDATED` event.

---

#### `delete(projectId, userId)`

Deletes a project. Verifies ownership first.

**Side Effects:** Publishes `PROJECT_DELETED` event.

---

#### `generateCode(projectId, userId, prompt, model?, provider?)`

Queues an AI code generation job via BullMQ.

**Flow:**
1. Verify project exists and user owns it
2. Check daily usage: `getUserUsageToday()` — max 100 jobs/day
3. Create `generation_jobs` record with status `queued`
4. Get current project files for context
5. Enqueue to `codeGenerationQueue` with job data:
   ```json
   {
     "jobId": "uuid",
     "projectId": "uuid",
     "userId": "uuid",
     "prompt": "...",
     "model": "gpt-4",
     "provider": "openai",
     "framework": "nextjs",
     "existingFiles": [{ "path": "...", "content": "..." }]
   }
   ```
6. Set priority: `high` if < 50 daily jobs, `normal` otherwise
7. Return `{ jobId, status: 'queued', message }` immediately

**Result Delivery:** Worker processes job → saves files → publishes event → Socket.IO notifies client.

---

#### `launchSandbox(projectId, userId)`

Launches a sandboxed Docker container for live preview.

**Flow:**
1. Verify project exists and user owns it
2. Fetch current project files
3. Enqueue to `sandboxExecutionQueue`
4. Return `{ sandboxId, status: 'launching' }`

**Auto-cleanup:** Sandbox containers are killed after 10 minutes.

---

#### `createSnapshot(projectId, userId, label?, description?)`

Creates a version snapshot (save point).

**Flow:**
1. Verify ownership
2. Calls `ProjectRepository.createSnapshot()` which:
   - Starts a transaction
   - Reads all current-version files
   - Copies them with `version + 1`
   - Increments `current_version` on project
   - Creates `project_snapshots` record
   - Commits transaction

---

#### `getSnapshots(projectId, userId)`

Lists all snapshots for a project, newest first.

---

#### `restoreSnapshot(projectId, userId, version)`

Restores the project to a previous version. Updates `current_version` to the specified version.

---

## AIService

**File:** `packages/backend/src/services/ai/ai.service.ts`
**Singleton:** `aiService`

### Dependencies

| Dependency       | Purpose                                  |
|------------------|------------------------------------------|
| `CircuitBreaker` | Protects against AI provider failures    |
| `withRetry`      | Retries transient failures               |
| `config`         | AI provider selection, API keys          |
| `eventBus`       | Publishes generation events              |
| `@anthropic-ai/sdk` | Anthropic Claude API client           |
| `openai`         | OpenAI GPT API client                    |

### Key Interfaces

```typescript
interface GenerationRequest {
  projectId: string;
  prompt: string;
  context: {
    existingFiles: Array<{ path: string; content: string }>;
    projectFramework: string;
    projectDescription?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  };
  options?: {
    model?: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  };
}

interface GenerationResult {
  id: string;
  message: string;
  fileChanges: FileChange[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
  language: string;
}
```

### Methods

#### `generate(request)`

Main entry point for AI code generation. Protected by circuit breaker and retry logic.

**Flow:**
1. Generate unique generation ID
2. Publish `AI_GENERATION_STARTED` event
3. Execute with circuit breaker: `circuitBreaker.execute(() => withRetry(() => callAIProvider(...)))`
4. On success: Publish `AI_GENERATION_COMPLETED` event
5. On failure: Publish `AI_GENERATION_FAILED` event, re-throw

---

#### `callAIProvider(generationId, request)` (Private)

Calls the actual AI provider API.

**Anthropic Flow:**
1. Dynamically import `@anthropic-ai/sdk`
2. Create client with `ANTHROPIC_API_KEY`
3. Call `messages.create()` with model `claude-sonnet-4-20250514`, max 8192 tokens
4. Build system prompt with project context
5. Parse response into file changes

**OpenAI Flow:**
1. Dynamically import `openai`
2. Create client with `OPENAI_API_KEY`
3. Call `chat.completions.create()` with model from config (default: `gpt-4`), temperature 0.7
4. Parse response into file changes

---

#### `buildSystemPrompt(request)` (Private)

Constructs context-aware system prompt including:
- Framework information
- Existing files (limited to 20 for context window)
- Project description
- Output format instructions (the `=== FILE: path === ... === END FILE ===` format)
- Code quality guidelines

---

#### `parseFileChanges(text)` (Private)

Extracts file changes from AI response using regex:
```
=== FILE: src/app/page.tsx ===
export default function Home() { ... }
=== END FILE ===
```

Maps file extensions to languages automatically.

---

#### `estimateCost(provider, model, inputTokens, outputTokens)` (Private)

Calculates estimated API cost:

| Model          | Input Cost (per 1K) | Output Cost (per 1K) |
|----------------|---------------------|-----------------------|
| gpt-4          | $0.03               | $0.06                 |
| gpt-4-turbo    | $0.01               | $0.03                 |
| gpt-4o         | $0.005              | $0.015                |
| claude-sonnet  | $0.003              | $0.015                |
| claude-opus    | $0.015              | $0.075                |

---

#### `getCircuitBreakerStatus()`

Returns current circuit breaker health metrics: `{ name, state, failureCount, successCount, lastFailureTime }`.

---

## ChatService

**File:** `packages/backend/src/services/chat/index.ts`
**Singleton:** `chatService`

### Dependencies

| Dependency       | Purpose                               |
|------------------|---------------------------------------|
| `ChatRepository` | Message persistence                   |

### Methods

#### `getMessages(projectId, limit?, offset?)`

Retrieves conversation history for a project. Default: last 100 messages, ordered by `created_at ASC`.

**Returns:** Array of:
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "userId": "uuid",
  "role": "user",
  "content": "Add a dark mode toggle",
  "generationJobId": null,
  "fileChanges": null,
  "metadata": {},
  "createdAt": "2026-02-14T00:00:00.000Z"
}
```

---

#### `addUserMessage(projectId, userId, content)`

Saves a user message with `role: 'user'`.

---

#### `addAssistantMessage(projectId, content, generationJobId?, fileChanges?, metadata?)`

Saves an AI assistant response. Links to the generation job that produced it and includes file changes.

---

#### `addSystemMessage(projectId, content)`

Saves a system notification message (e.g., "Deployment successful").

---

#### `getMessageCount(projectId)`

Returns total message count for a project.

---

#### `clearHistory(projectId)`

Deletes all messages for a project. Returns count of deleted messages.

---

## DeploymentService

**File:** `packages/backend/src/services/deployment/index.ts`
**Singleton:** `deploymentService`

### Dependencies

| Dependency            | Purpose                            |
|-----------------------|------------------------------------|
| `DeploymentRepository`| Deployment record persistence      |
| `ProjectRepository`   | Project file access                |
| `deploymentQueue`     | Async deployment job queue         |
| `eventBus`            | Publishes deployment events        |

### Methods

#### `deploy(projectId, userId)`

Queues a new deployment.

**Flow:**
1. Create `deployments` record with status `queued`
2. Update project status to `deploying`
3. Enqueue to `deploymentQueue` with 5s delay, 2 retry attempts (exponential backoff)
4. Publish `PROJECT_DEPLOYED` event
5. Return `{ id, status: 'queued', message }`

---

#### `getDeployment(deploymentId)`

Get a single deployment by ID.

---

#### `getDeploymentsByProject(projectId)`

List all deployments for a project.

---

#### `getLiveDeployment(projectId)`

Get the currently active/live deployment.

---

#### `rollback(projectId, userId, deploymentId)`

Restores to a previous deployment version and re-deploys.

**Flow:**
1. Look up the target deployment to get its version
2. Restore project snapshot to that version
3. Queue a new deployment with the restored files

---

## CollaborationService

**File:** `packages/backend/src/services/collaboration/collaboration.service.ts`
**Singleton:** `collaborationService`

### Dependencies

| Dependency   | Purpose                           |
|--------------|-----------------------------------|
| `getDatabase`| Direct Knex DB access             |
| `eventBus`   | Publishes collaboration events    |

### Methods

#### `createOrJoinSession(projectId, userId, userName)`

Creates a new collaboration session or joins an existing one.

**Flow:**
1. Check for existing active session on this project
2. If exists: add participant and return existing session
3. If new: create session with user as `owner` role
4. Publish `COLLABORATION_SESSION_STARTED` event (if new)

---

#### `addParticipant(sessionId, userId, userName)`

Adds a participant with `editor` role. Prevents duplicate participants.

**Side Effects:** Publishes `COLLABORATION_USER_JOINED` event.

---

#### `removeParticipant(sessionId, userId)`

Removes a participant. Deactivates the session if no participants remain.

**Side Effects:** Publishes `COLLABORATION_USER_LEFT` event.

---

#### `updateCursor(sessionId, userId, cursor)`

Updates a participant's cursor position for real-time collaborative editing.

**Cursor Object:**
```json
{ "fileId": "src/app/page.tsx", "line": 42, "column": 10 }
```

---

#### `getSession(sessionId)` / `getSessionByProject(projectId)`

Retrieve collaboration sessions.

---

#### `cleanupInactiveSessions()`

Deactivates sessions that have been inactive for 24+ hours. Returns count of cleaned sessions.

---

## NotificationService

**File:** `packages/backend/src/services/notification/index.ts`
**Singleton:** `notificationService`

### Dependencies

| Dependency          | Purpose                         |
|---------------------|---------------------------------|
| `notificationQueue` | Async notification delivery     |
| `eventBus`          | Subscribes to domain events     |

### Event Subscriptions

The notification service subscribes to domain events and creates notifications:

| Event                        | Notification Type | Title                          |
|------------------------------|-------------------|--------------------------------|
| `PROJECT_DEPLOYED`           | `deployment`      | "Deployment Complete"          |
| `AI_GENERATION_COMPLETED`    | `generation`      | "Code Generation Complete"     |
| `AI_GENERATION_FAILED`       | `error`           | "Code Generation Failed"       |

### Methods

#### `createNotification(userId, type, title, message, metadata?)`

Queues a notification for async delivery (email, push, WebSocket, etc.).

---

#### `getNotifications(userId, limit?, offset?)`

Returns user's notification history. *(Currently returns empty array — needs `notifications` table in future migration.)*

---

#### `markAsRead(userId, notificationId)`

Marks a notification as read. *(Placeholder — needs `notifications` table.)*

---

## Enterprise Patterns

### Circuit Breaker

**File:** `packages/backend/src/patterns/circuit-breaker/index.ts`

Protects against cascading failures when external services (AI providers) are unavailable.

**States:**
```
                 failureThreshold exceeded
    ┌────────┐ ─────────────────────────► ┌────────┐
    │ CLOSED │                             │  OPEN  │
    │(normal)│ ◄───────────────────────── │(reject)│
    └────────┘    successThreshold met     └───┬────┘
                  in HALF_OPEN                 │
                        ▲                      │
                        │    recoveryTimeout   │
                        │      expired         │
                   ┌────┴─────┐                │
                   │HALF_OPEN │ ◄──────────────┘
                   │ (testing)│
                   └──────────┘
```

**Configuration:**
| Parameter           | Default | Description                        |
|---------------------|---------|------------------------------------|
| `failureThreshold`  | `5`     | Failures before OPEN               |
| `recoveryTimeout`   | `30000` | Milliseconds before testing        |
| `successThreshold`  | `3`     | Successes to close after HALF_OPEN |

**Usage:**
```typescript
const result = await circuitBreaker.execute(
  () => callExternalAPI(),        // primary function
  () => getFallbackResponse()     // optional fallback
);
```

**Events Published:**
- `CIRCUIT_BREAKER_OPENED` — when transitioning to OPEN
- `CIRCUIT_BREAKER_CLOSED` — when recovering to CLOSED

---

### Retry with Exponential Backoff

**File:** `packages/backend/src/patterns/retry/index.ts`

Handles transient failures with exponential backoff and jitter.

**Configuration:**
| Parameter            | Default  | Description                       |
|----------------------|----------|-----------------------------------|
| `maxAttempts`        | `3`      | Maximum retry attempts            |
| `baseDelayMs`       | `1000`   | Initial delay in ms               |
| `maxDelayMs`        | `30000`  | Maximum delay cap                 |
| `backoffMultiplier` | `2`      | Multiplier per attempt            |
| `retryableErrors`   | `[]`     | Filter by error message patterns  |

**Delay Formula:**
```
delay = min(baseDelay * multiplier^(attempt-1) + random(0-1000), maxDelay)
```

Example delays: 1s, 2s+jitter, 4s+jitter (capped at 30s)

**Two ways to use:**

Function wrapper:
```typescript
const result = await withRetry(() => fetchFromAPI(), { maxAttempts: 5 });
```

Method decorator:
```typescript
class MyService {
  @retryable({ maxAttempts: 3, baseDelayMs: 500 })
  async callExternalAPI() { ... }
}
```

---

### Token Bucket Rate Limiter

**File:** `packages/backend/src/patterns/rate-limiter/index.ts`

Express middleware for per-client request throttling.

**Pre-configured Instances:**

| Name                | Window | Max Requests | Key             |
|---------------------|--------|--------------|-----------------|
| `globalRateLimiter` | 15 min | 100          | Client IP       |
| `authRateLimiter`   | 15 min | 10           | Client IP       |
| `aiRateLimiter`     | 15 min | 20           | User ID (or IP) |

**Response Headers:**
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1707955200
```

**Custom Limiter:**
```typescript
const customLimiter = createCustomRateLimiter(60000, 30); // 30 req per 60s
app.use('/api/v1/special', customLimiter);
```

---

### CQRS (Command Query Responsibility Segregation)

**File:** `packages/backend/src/patterns/cqrs/index.ts`

Separates write operations (commands) from read operations (queries) for independent optimization.

**Architecture:**
```
Commands (side effects)          Queries (read-only)
┌─────────────────────┐          ┌────────────────────┐
│    CommandBus        │          │     QueryBus       │
│ ┌─────────────────┐ │          │ ┌────────────────┐ │
│ │ register(type,  │ │          │ │ register(type, │ │
│ │   handler)      │ │          │ │   handler)     │ │
│ ├─────────────────┤ │          │ ├────────────────┤ │
│ │ dispatch(cmd)   │ │          │ │ dispatch(query)│ │
│ └─────────────────┘ │          │ └────────────────┘ │
└─────────────────────┘          └────────────────────┘
```

**Usage:**
```typescript
// Register handler
commandBus.register('CreateProject', new CreateProjectHandler());

// Dispatch command
const result = await commandBus.dispatch({ type: 'CreateProject', name: 'My App' });
```

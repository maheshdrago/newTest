# BuildCraft AI - Database Schema Documentation

Complete documentation of the PostgreSQL database schema, migrations, repositories, and data access patterns.

**Database:** PostgreSQL 16
**ORM:** Knex.js (query builder)
**Connection Pool:** Min 2, Max 10 connections, 30s acquire timeout
**Migrations Directory:** `packages/backend/src/infrastructure/database/migrations/`

---

## Table of Contents

1. [Entity Relationship Diagram](#entity-relationship-diagram)
2. [Tables](#tables)
3. [Indexes](#indexes)
4. [Migrations](#migrations)
5. [Repository Pattern](#repository-pattern)
6. [Repositories Reference](#repositories-reference)

---

## Entity Relationship Diagram

```
┌──────────────────┐      ┌──────────────────┐      ┌────────────────────┐
│     users        │      │    projects      │      │  project_files     │
│──────────────────│      │──────────────────│      │────────────────────│
│ id (uuid PK)     │◄─────│ owner_id (FK)    │◄─────│ project_id (FK)    │
│ email (unique)   │      │ id (uuid PK)     │      │ id (uuid PK)       │
│ password_hash    │      │ name             │      │ path               │
│ name             │      │ description      │      │ content (text)     │
│ avatar_url       │      │ framework        │      │ language           │
│ role             │      │ status           │      │ checksum (sha256)  │
│ plan             │      │ visibility       │      │ size_bytes         │
│ preferences      │      │ current_version  │      │ version (int)      │
│ last_login_at    │      │ settings (jsonb) │      │ UNIQUE(project,    │
│ created_at       │      │ metadata (jsonb) │      │   path, version)   │
│ updated_at       │      │ created_at       │      │ created_at         │
└──────┬───────────┘      │ updated_at       │      │ updated_at         │
       │                  └────────┬─────────┘      └────────────────────┘
       │                           │
       │     ┌─────────────────────┼──────────────────────┐
       │     │                     │                      │
       │     ▼                     ▼                      ▼
       │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐
       │  │project_snapshots │  │  deployments     │  │ generation_jobs    │
       │  │──────────────────│  │──────────────────│  │────────────────────│
       │  │ id (uuid PK)     │  │ id (uuid PK)     │  │ id (uuid PK)       │
       │  │ project_id (FK)  │  │ project_id (FK)  │  │ project_id (FK)    │
       │  │ version          │  │ version          │  │ user_id (FK)       │
       │  │ label            │  │ status           │  │ prompt (text)      │
       │  │ description      │  │ url              │  │ model              │
       │  │ created_by (FK)  │  │ container_id     │  │ provider           │
       │  │ file_manifest    │  │ build_logs(jsonb)│  │ status             │
       │  │ UNIQUE(project,  │  │ environment(jsonb│  │ result (jsonb)     │
       │  │   version)       │  │ started_at       │  │ tokens_used        │
       │  │ created_at       │  │ completed_at     │  │ cost (decimal)     │
       │  └──────────────────┘  │ created_at       │  │ duration_ms        │
       │                        │ updated_at       │  │ error_message      │
       │                        └──────────────────┘  │ created_at         │
       │                                              │ updated_at         │
       │                                              └────────────────────┘
       │
       │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐
       ├─►│  user_sessions   │  │  chat_messages   │  │   audit_logs       │
       │  │──────────────────│  │──────────────────│  │────────────────────│
       │  │ id (uuid PK)     │  │ id (uuid PK)     │  │ id (uuid PK)       │
       ├─►│ user_id (FK)     │  │ project_id (FK)  │  │ user_id (FK)       │
       │  │ token_hash       │  │ user_id (FK)     │  │ action             │
       │  │ device_name      │  │ role             │  │ resource_type      │
       │  │ ip_address       │  │ content (text)   │  │ resource_id        │
       │  │ user_agent       │  │ generation_job_id│  │ details (jsonb)    │
       │  │ last_active_at   │  │ file_changes     │  │ ip_address         │
       │  │ expires_at       │  │ metadata (jsonb) │  │ user_agent         │
       │  │ is_revoked       │  │ created_at       │  │ created_at         │
       │  │ created_at       │  │ updated_at       │  └────────────────────┘
       │  │ updated_at       │  └──────────────────┘
       │  └──────────────────┘
       │
       │  ┌──────────────────────────┐
       └─►│ collaboration_sessions   │
          │──────────────────────────│
          │ id (uuid PK)             │
          │ project_id (FK)          │
          │ is_active (bool)         │
          │ participants (jsonb)     │
          │ created_at               │
          │ updated_at               │
          └──────────────────────────┘
```

---

## Tables

### users

Stores all user accounts.

| Column         | Type                     | Constraints                                | Description                     |
|----------------|--------------------------|--------------------------------------------|---------------------------------|
| `id`           | `uuid`                   | PK, default `gen_random_uuid()`            | Unique user identifier          |
| `email`        | `varchar(255)`           | NOT NULL, UNIQUE                           | Login email                     |
| `password_hash`| `varchar(255)`           | NOT NULL                                   | bcryptjs hash (12 salt rounds)  |
| `name`         | `varchar(255)`           | NOT NULL                                   | Display name                    |
| `avatar_url`   | `varchar(500)`           | NULL                                       | Profile picture URL             |
| `role`         | `varchar(50)`            | NOT NULL, default `'member'`               | `admin` \| `member` \| `viewer` |
| `plan`         | `varchar(50)`            | NOT NULL, default `'free'`                 | `free` \| `pro` \| `team` \| `enterprise` |
| `preferences`  | `jsonb`                  | default `'{}'`                             | User preferences blob           |
| `last_login_at`| `timestamp`              | NULL                                       | Last successful login           |
| `created_at`   | `timestamp`              | NOT NULL, default `now()`                  | Account creation time           |
| `updated_at`   | `timestamp`              | NOT NULL, default `now()`                  | Last profile update             |

---

### projects

Core entity — each project represents a generated application.

| Column           | Type                     | Constraints                                | Description                     |
|------------------|--------------------------|--------------------------------------------|---------------------------------|
| `id`             | `uuid`                   | PK, default `gen_random_uuid()`            | Unique project ID               |
| `name`           | `varchar(255)`           | NOT NULL                                   | Project name                    |
| `description`    | `text`                   | NULL                                       | Project description             |
| `framework`      | `varchar(50)`            | NOT NULL, default `'react'`                | `react` \| `nextjs` \| `vue` \| `svelte` \| `vanilla` |
| `status`         | `varchar(50)`            | NOT NULL, default `'draft'`                | Lifecycle state (see below)     |
| `visibility`     | `varchar(50)`            | NOT NULL, default `'private'`              | `private` \| `public` \| `team` |
| `owner_id`       | `uuid`                   | NOT NULL, FK → `users.id`                  | Project owner                   |
| `current_version`| `integer`                | NOT NULL, default `1`                      | Current file version number     |
| `settings`       | `jsonb`                  | default `'{}'`                             | Project-level settings          |
| `metadata`       | `jsonb`                  | default `'{}'`                             | Arbitrary metadata              |
| `created_at`     | `timestamp`              | NOT NULL, default `now()`                  | Project creation time           |
| `updated_at`     | `timestamp`              | NOT NULL, default `now()`                  | Last update time                |

**Status Lifecycle:**
```
draft → generating → ready → deploying → deployed
                       ↑                     ↓
                       └── error ←───────────┘
                                   archived
```

---

### project_files

Stores all source code files for every version of a project.

| Column       | Type            | Constraints                              | Description                     |
|--------------|-----------------|------------------------------------------|---------------------------------|
| `id`         | `uuid`          | PK, default `gen_random_uuid()`          | File record ID                  |
| `project_id` | `uuid`          | NOT NULL, FK → `projects.id`             | Parent project                  |
| `path`       | `varchar(500)`  | NOT NULL                                 | File path (e.g., `src/app/page.tsx`) |
| `content`    | `text`          | NOT NULL                                 | Full file content               |
| `language`   | `varchar(50)`   | NULL                                     | Programming language            |
| `checksum`   | `varchar(64)`   | NULL                                     | SHA-256 of content              |
| `size_bytes` | `integer`       | NULL                                     | File size in bytes              |
| `version`    | `integer`       | NOT NULL, default `1`                    | Version this file belongs to    |
| `created_at` | `timestamp`     | NOT NULL, default `now()`                | File creation time              |
| `updated_at` | `timestamp`     | NOT NULL, default `now()`                | Last modification               |

**Unique Constraint:** `(project_id, path, version)` — one file per path per version.

**Versioning Model:**
Files are immutable within a version. When a snapshot is created, all current-version files are copied to a new version number. This enables point-in-time restores without losing history.

---

### project_snapshots

Version control snapshots (save points).

| Column         | Type        | Constraints                              | Description                     |
|----------------|-------------|------------------------------------------|---------------------------------|
| `id`           | `uuid`      | PK, default `gen_random_uuid()`          | Snapshot ID                     |
| `project_id`   | `uuid`      | NOT NULL, FK → `projects.id`             | Parent project                  |
| `version`      | `integer`   | NOT NULL                                 | Version number of this snapshot |
| `label`        | `varchar(255)` | NULL                                  | User-provided label             |
| `description`  | `text`      | NULL                                     | User-provided description       |
| `created_by`   | `uuid`      | FK → `users.id`                          | User who created snapshot       |
| `file_manifest`| `jsonb`     | NULL                                     | JSON array of file paths/checksums |
| `created_at`   | `timestamp` | NOT NULL, default `now()`                | Snapshot creation time          |

**Unique Constraint:** `(project_id, version)` — one snapshot per version.

---

### deployments

Tracks Docker container deployments.

| Column         | Type           | Constraints                              | Description                     |
|----------------|----------------|------------------------------------------|---------------------------------|
| `id`           | `uuid`         | PK, default `gen_random_uuid()`          | Deployment ID                   |
| `project_id`   | `uuid`         | NOT NULL, FK → `projects.id`             | Deployed project                |
| `version`      | `integer`      | NULL                                     | Project version deployed        |
| `status`       | `varchar(50)`  | NOT NULL, default `'queued'`             | Deployment state                |
| `url`          | `varchar(500)` | NULL                                     | Live URL (e.g., `https://abc.buildcraft.app`) |
| `container_id` | `varchar(255)` | NULL                                     | Docker container ID             |
| `build_logs`   | `jsonb`        | default `'[]'`                           | Append-only JSONB log array     |
| `environment`  | `jsonb`        | default `'{}'`                           | Environment variables           |
| `started_at`   | `timestamp`    | NULL                                     | Build start time                |
| `completed_at` | `timestamp`    | NULL                                     | Build completion time           |
| `created_at`   | `timestamp`    | NOT NULL, default `now()`                | Record creation                 |
| `updated_at`   | `timestamp`    | NOT NULL, default `now()`                | Last status update              |

**Status Lifecycle:** `queued` → `building` → `deploying` → `live` | `failed` | `rolled_back`

**Build Logs:** Appended via PostgreSQL JSONB concatenation:
```sql
UPDATE deployments SET build_logs = build_logs || ?::jsonb WHERE id = ?
```

---

### generation_jobs

Tracks AI code generation tasks.

| Column          | Type            | Constraints                              | Description                     |
|-----------------|-----------------|------------------------------------------|---------------------------------|
| `id`            | `uuid`          | PK, default `gen_random_uuid()`          | Job ID                          |
| `project_id`    | `uuid`          | NOT NULL, FK → `projects.id`             | Target project                  |
| `user_id`       | `uuid`          | NOT NULL, FK → `users.id`               | Requesting user                 |
| `prompt`        | `text`          | NOT NULL                                 | User's generation prompt        |
| `model`         | `varchar(100)`  | NULL                                     | AI model used (e.g., `gpt-4`)  |
| `provider`      | `varchar(50)`   | NULL                                     | Provider (openai/anthropic)     |
| `status`        | `varchar(50)`   | NOT NULL, default `'queued'`             | Job state                       |
| `result`        | `jsonb`         | NULL                                     | Generation output (file changes, message) |
| `tokens_used`   | `integer`       | NULL                                     | Total tokens consumed           |
| `cost`          | `decimal(10,6)` | NULL                                     | Estimated API cost in USD       |
| `duration_ms`   | `integer`       | NULL                                     | Processing time in ms           |
| `error_message` | `text`          | NULL                                     | Error details if failed         |
| `created_at`    | `timestamp`     | NOT NULL, default `now()`                | Job queued time                 |
| `updated_at`    | `timestamp`     | NOT NULL, default `now()`                | Last status update              |

**Status Lifecycle:** `queued` → `processing` → `completed` | `failed`

---

### collaboration_sessions

Real-time collaboration sessions per project.

| Column         | Type       | Constraints                              | Description                     |
|----------------|------------|------------------------------------------|---------------------------------|
| `id`           | `uuid`     | PK, default `gen_random_uuid()`          | Session ID                      |
| `project_id`   | `uuid`     | NOT NULL, FK → `projects.id`             | Collaboration target project    |
| `is_active`    | `boolean`  | NOT NULL, default `true`                 | Whether session is active       |
| `participants` | `jsonb`    | default `'[]'`                           | Array of participant objects     |
| `created_at`   | `timestamp`| NOT NULL, default `now()`                | Session start time              |
| `updated_at`   | `timestamp`| NOT NULL, default `now()`                | Last activity                   |

**Participants JSONB Structure:**
```json
[
  {
    "userId": "uuid",
    "name": "John Doe",
    "role": "owner",
    "cursor": { "fileId": "path/to/file.tsx", "line": 42, "column": 10 },
    "joinedAt": "2026-02-14T00:00:00.000Z"
  }
]
```

---

### audit_logs

Immutable audit trail for security-sensitive actions.

| Column          | Type           | Constraints                              | Description                     |
|-----------------|----------------|------------------------------------------|---------------------------------|
| `id`            | `uuid`         | PK, default `gen_random_uuid()`          | Log entry ID                    |
| `user_id`       | `uuid`         | FK → `users.id`                          | Acting user                     |
| `action`        | `varchar(100)` | NOT NULL                                 | Action name (e.g., `user.login`) |
| `resource_type` | `varchar(100)` | NULL                                     | Target resource type            |
| `resource_id`   | `uuid`         | NULL                                     | Target resource ID              |
| `details`       | `jsonb`        | default `'{}'`                           | Additional context              |
| `ip_address`    | `varchar(45)`  | NULL                                     | Client IP address               |
| `user_agent`    | `text`         | NULL                                     | Client user-agent string        |
| `created_at`    | `timestamp`    | NOT NULL, default `now()`                | Log timestamp                   |

---

### user_sessions

Persistent session management for JWT refresh token tracking.

| Column          | Type           | Constraints                              | Description                     |
|-----------------|----------------|------------------------------------------|---------------------------------|
| `id`            | `uuid`         | PK, default `gen_random_uuid()`          | Session ID                      |
| `user_id`       | `uuid`         | NOT NULL, FK → `users.id`               | Session owner                   |
| `token_hash`    | `varchar(64)`  | NOT NULL                                 | SHA-256 hash of refresh token   |
| `device_name`   | `varchar(255)` | NULL                                     | Device identifier               |
| `ip_address`    | `varchar(45)`  | NULL                                     | Client IP at creation           |
| `user_agent`    | `text`         | NULL                                     | Client user-agent at creation   |
| `last_active_at`| `timestamp`    | default `now()`                          | Last token refresh time         |
| `expires_at`    | `timestamp`    | NOT NULL                                 | Session expiration              |
| `is_revoked`    | `boolean`      | NOT NULL, default `false`                | Whether session is revoked      |
| `created_at`    | `timestamp`    | NOT NULL, default `now()`                | Session creation time           |
| `updated_at`    | `timestamp`    | NOT NULL, default `now()`                | Last update time                |

**Token Security:**
- Refresh tokens are **never stored in plaintext**
- `token_hash = SHA-256(refreshToken)` computed via `crypto.createHash('sha256')`
- Lookup: hash the incoming token, find matching `token_hash`
- Old tokens are **revoked** (not deleted) on rotation for audit trail

---

### chat_messages

Persistent conversation history per project.

| Column            | Type           | Constraints                              | Description                     |
|-------------------|----------------|------------------------------------------|---------------------------------|
| `id`              | `uuid`         | PK, default `gen_random_uuid()`          | Message ID                      |
| `project_id`      | `uuid`         | NOT NULL, FK → `projects.id`             | Parent project                  |
| `user_id`         | `uuid`         | FK → `users.id`                          | Message author (NULL for system) |
| `role`            | `varchar(50)`  | NOT NULL                                 | `user` \| `assistant` \| `system` |
| `content`         | `text`         | NOT NULL                                 | Message content                 |
| `generation_job_id`| `uuid`        | FK → `generation_jobs.id`                | Linked generation job           |
| `file_changes`    | `jsonb`        | NULL                                     | File changes from generation    |
| `metadata`        | `jsonb`        | default `'{}'`                           | Additional metadata             |
| `created_at`      | `timestamp`    | NOT NULL, default `now()`                | Message timestamp               |
| `updated_at`      | `timestamp`    | NOT NULL, default `now()`                | Last update                     |

---

## Indexes

### Migration 001

| Index Name                    | Table             | Column(s)            | Notes                  |
|-------------------------------|-------------------|----------------------|------------------------|
| `idx_projects_owner`          | `projects`        | `owner_id`           | Fast user project list |
| `idx_project_files_project`   | `project_files`   | `project_id`         | Fast file lookup       |
| `idx_deployments_project`     | `deployments`     | `project_id`         | Deployment history     |
| `idx_generation_jobs_project` | `generation_jobs` | `project_id`         | Job history            |
| `idx_generation_jobs_status`  | `generation_jobs` | `status`             | Queue processing       |
| `idx_audit_logs_user`         | `audit_logs`      | `user_id`            | User action history    |
| `idx_audit_logs_action`       | `audit_logs`      | `action`             | Action type queries    |

### Migration 002

| Index Name                    | Table             | Column(s)            | Notes                                |
|-------------------------------|-------------------|----------------------|--------------------------------------|
| `idx_user_sessions_user`      | `user_sessions`   | `user_id`            | User's active sessions               |
| `idx_user_sessions_token`     | `user_sessions`   | `token_hash`         | Fast token lookup                    |
| `idx_user_sessions_expires`   | `user_sessions`   | `expires_at`         | **Partial index** WHERE NOT revoked  |
| `idx_chat_messages_project`   | `chat_messages`   | `project_id`         | Conversation history                 |
| `idx_chat_messages_created`   | `chat_messages`   | `created_at`         | Ordered message retrieval            |

---

## Migrations

### 001_initial_schema.ts

Creates the foundational schema:
- `users`, `projects`, `project_files`, `project_snapshots`
- `deployments`, `generation_jobs`, `collaboration_sessions`, `audit_logs`
- All foreign key relationships and indexes

### 002_sessions_and_chat.ts

Adds session management and chat persistence:
- `user_sessions` — JWT refresh token session tracking
- `chat_messages` — Project conversation history
- Partial index on `user_sessions.expires_at` for non-revoked sessions

**Running Migrations:**
```bash
# Run all pending migrations
cd packages/backend && npx knex migrate:latest

# Rollback last migration batch
cd packages/backend && npx knex migrate:rollback

# Check migration status
cd packages/backend && npx knex migrate:status
```

---

## Repository Pattern

All database access goes through the repository pattern. Each entity has a dedicated repository class extending `BaseRepository<T>`.

### BaseRepository\<T\>

Abstract base class providing common CRUD operations:

```
BaseRepository<T>
├── findById(id: string): Promise<T | null>
├── findAll(filters: Partial<T>, limit?, offset?): Promise<T[]>
├── create(data: Partial<T>): Promise<T>
├── update(id: string, data: Partial<T>): Promise<T | null>
├── delete(id: string): Promise<boolean>
├── count(filters: Partial<T>): Promise<number>
└── transaction<R>(fn: (trx) => Promise<R>): Promise<R>
```

- `findAll` defaults to `limit = 50`, ordered by `created_at DESC`
- `create` returns the inserted row
- `update` returns the updated row or `null` if not found
- `delete` returns `true`/`false`
- `transaction` wraps operations in a PostgreSQL transaction

---

## Repositories Reference

### UserRepository

| Method                          | Returns                    | Description                     |
|---------------------------------|----------------------------|---------------------------------|
| `findByEmail(email)`            | `UserRow \| null`          | Lookup by unique email          |
| `updateLastLogin(id)`           | `void`                     | Set `last_login_at = now()`     |
| `updatePassword(id, hash)`      | `void`                     | Update password hash            |
| + all BaseRepository methods    |                            |                                 |

### ProjectRepository

| Method                                          | Returns                    | Description                     |
|-------------------------------------------------|----------------------------|---------------------------------|
| `findByOwner(ownerId, limit?, offset?)`         | `ProjectRow[]`             | List owner's projects           |
| `findWithFiles(projectId)`                      | `{project, files} \| null` | Project + current version files |
| `getFiles(projectId, version?)`                 | `ProjectFileRow[]`         | Files for specific version      |
| `upsertFile(projectId, path, content, lang, version, trx?)` | `ProjectFileRow` | Insert or update file (SHA-256 checksum computed) |
| `deleteFile(projectId, path, version)`          | `boolean`                  | Remove file                     |
| `createSnapshot(projectId, userId, label?, description?)` | `ProjectSnapshotRow` | Create version snapshot (transaction) |
| `getSnapshots(projectId)`                       | `ProjectSnapshotRow[]`     | List snapshots newest-first     |
| `restoreSnapshot(projectId, version)`           | `void`                     | Restore to specific version     |

### GenerationJobRepository

| Method                                        | Returns                              | Description                     |
|-----------------------------------------------|--------------------------------------|---------------------------------|
| `findByProject(projectId, limit?)`            | `GenerationJobRow[]`                 | Generation history              |
| `findPending(limit?)`                         | `GenerationJobRow[]`                 | Queued jobs (FIFO)              |
| `markProcessing(id)`                          | `void`                               | Status → processing             |
| `markCompleted(id, result, tokens, cost, ms)` | `void`                               | Status → completed + metrics    |
| `markFailed(id, errorMessage)`                | `void`                               | Status → failed + error         |
| `getUserUsageToday(userId)`                   | `{totalTokens, totalCost, jobCount}` | Daily usage stats               |

### DeploymentRepository

| Method                          | Returns                    | Description                     |
|---------------------------------|----------------------------|---------------------------------|
| `findByProject(projectId)`      | `DeploymentRow[]`          | All deployments for project     |
| `findLive(projectId)`           | `DeploymentRow \| null`    | Current live deployment         |
| `appendLog(id, log)`            | `void`                     | Append to JSONB build_logs      |

### AuditRepository

| Method                                            | Returns             | Description                     |
|---------------------------------------------------|---------------------|---------------------------------|
| `log(entry: Omit<AuditLogRow, 'id'\|'created_at'>)` | `void`           | Create audit entry              |
| `findByUser(userId, limit?)`                      | `AuditLogRow[]`     | User's action history           |
| `findByResource(resourceType, resourceId, limit?)`| `AuditLogRow[]`     | Resource change history         |

### SessionRepository

| Method                                                      | Returns              | Description                           |
|-------------------------------------------------------------|----------------------|---------------------------------------|
| `static hashToken(token)`                                   | `string`             | SHA-256 hash                          |
| `createSession({userId, refreshToken, expiresAt, ...})`     | `UserSessionRow`     | Create session (stores hashed token)  |
| `findByToken(refreshToken)`                                 | `UserSessionRow \| null` | Lookup by token (valid, not expired, not revoked) |
| `revokeSession(refreshToken)`                               | `void`               | Mark session as revoked               |
| `revokeAllUserSessions(userId)`                             | `number`             | Revoke all user sessions, return count|
| `revokeSessionById(sessionId, userId)`                      | `boolean`            | Revoke specific session               |
| `getActiveSessions(userId)`                                 | `UserSessionRow[]`   | Non-revoked, non-expired sessions     |
| `touchSession(refreshToken)`                                | `void`               | Update `last_active_at`               |
| `cleanupExpired()`                                          | `number`             | Delete expired + old revoked sessions |

### ChatRepository

| Method                                              | Returns               | Description                     |
|-----------------------------------------------------|-----------------------|---------------------------------|
| `getProjectMessages(projectId, limit?, offset?)`    | `ChatMessageRow[]`    | Conversation history (ASC)      |
| `addMessage({projectId, userId?, role, content, ...})` | `ChatMessageRow`    | Insert new message              |
| `getMessageCount(projectId)`                        | `number`              | Message count for project       |
| `deleteProjectMessages(projectId)`                  | `number`              | Delete all, return count        |

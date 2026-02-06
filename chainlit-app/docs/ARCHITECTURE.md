# Chainlit-WS — Architecture Deep Dive

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Directory Structure](#directory-structure)
4. [WebSocket Protocol](#websocket-protocol)
5. [Session Management](#session-management)
6. [Conversation Persistence](#conversation-persistence)
7. [AI Streaming Pipeline](#ai-streaming-pipeline)
8. [Nginx Reverse Proxy](#nginx-reverse-proxy)
9. [Docker & Productionization](#docker--productionization)
10. [Security Considerations](#security-considerations)
11. [Scaling Strategies](#scaling-strategies)

---

## Overview

Chainlit-WS is a **from-scratch** conversational AI application that replicates the core mechanics of products like Chainlit, ChatGPT, and similar chat UIs. It is built entirely in **Node.js + TypeScript** with no framework magic — every WebSocket frame, every database query, every session cookie is hand-wired so you understand exactly what happens under the hood.

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| **WebSockets** (not HTTP polling) | Real-time token streaming with minimal latency |
| **SQLite** (not Postgres/Redis) | Zero-ops persistence; single-file DB perfect for dev and small-to-mid production |
| **OpenAI SDK** (not raw fetch) | Handles SSE parsing, retries, and typed responses |
| **Vanilla JS frontend** | No React/Vue build step; keeps the focus on WebSocket mechanics |
| **Nginx** | Battle-tested reverse proxy for TLS, caching, and WS upgrade |

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                          │
│  ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐   │
│  │  index.html   │   │   style.css     │   │     app.js       │   │
│  │  (SPA shell)  │   │   (dark theme)  │   │  (WS client +    │   │
│  │               │   │                 │   │   DOM rendering)  │   │
│  └──────────────┘   └────────────────┘   └────────┬─────────┘   │
│                                                    │              │
│                                         WebSocket  │  HTTP        │
└────────────────────────────────────────────────────┼──────────────┘
                                                     │
                              ┌───────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │       NGINX        │
                    │  (reverse proxy)   │
                    │  - TLS termination │
                    │  - WS upgrade      │
                    │  - rate limiting   │
                    │  - gzip / caching  │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────────────────────────────┐
                    │            NODE.JS SERVER                   │
                    │                                             │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
                    │  │  Express  │  │    WS     │  │ Session  │ │
                    │  │  (HTTP)   │  │ (handler) │  │ (cookie) │ │
                    │  └────┬─────┘  └────┬──────┘  └────┬─────┘ │
                    │       │             │              │        │
                    │       └──────┬──────┘──────────────┘        │
                    │              │                               │
                    │  ┌───────────▼────────────┐                 │
                    │  │    Repositories         │                 │
                    │  │  (Session, Conversation, │                │
                    │  │   Message)               │                │
                    │  └───────────┬─────────────┘                │
                    │              │                               │
                    │  ┌───────────▼─────┐   ┌─────────────────┐  │
                    │  │   SQLite (WAL)   │   │  AI Provider    │  │
                    │  │   better-sqlite3 │   │  (OpenAI SDK)   │  │
                    │  └─────────────────┘   └────────┬────────┘  │
                    │                                  │           │
                    └──────────────────────────────────┼───────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  OpenAI / LLM   │
                                              │  API (external)  │
                                              └─────────────────┘
```

---

## Directory Structure

```
chainlit-app/
├── public/                  # Static files served by Express
│   ├── index.html           # SPA entry point
│   ├── css/style.css        # Dark theme styles
│   └── js/app.js            # Client-side WS logic + DOM rendering
│
├── src/                     # TypeScript server source
│   ├── server.ts            # Entry point — boots Express + WS server
│   ├── config.ts            # Environment config with validation
│   │
│   ├── types/
│   │   └── index.ts         # Domain types (Message, Conversation, Session, WS protocol)
│   │
│   ├── db/
│   │   ├── schema.ts        # SQL DDL (CREATE TABLE statements)
│   │   ├── connection.ts    # SQLite singleton with WAL + pragma tuning
│   │   ├── repositories.ts  # Data access: SessionRepo, ConversationRepo, MessageRepo
│   │   └── migrate.ts       # Standalone migration runner
│   │
│   ├── ai/
│   │   └── provider.ts      # OpenAI-compatible streaming client
│   │
│   ├── ws/
│   │   └── handler.ts       # WebSocket connection + message routing
│   │
│   ├── http/
│   │   └── routes.ts        # Express routes (health, session, SPA fallback)
│   │
│   ├── middleware/
│   │   ├── session.ts       # Cookie-based session for HTTP + WS
│   │   └── rateLimit.ts     # In-memory rate limiter
│   │
│   └── utils/
│       └── logger.ts        # Structured console logger
│
├── nginx/
│   └── nginx.conf           # Production Nginx config
│
├── docs/
│   └── ARCHITECTURE.md      # This file
│
├── Dockerfile               # Multi-stage build
├── docker-compose.yml       # Full stack (app + nginx)
├── .dockerignore
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## WebSocket Protocol

### Why WebSockets?

HTTP request/response cannot stream tokens in real-time. Alternatives:

| Approach | Latency | Complexity | Bi-directional |
|----------|---------|------------|----------------|
| HTTP polling | High (100-500ms gaps) | Low | No |
| Server-Sent Events (SSE) | Low | Medium | No (server→client only) |
| **WebSockets** | **Lowest** | **Medium** | **Yes** |

WebSockets give us true bi-directional communication: the client can send messages AND cancel streams mid-flight, while the server pushes tokens the instant they arrive from the LLM.

### Protocol design

Every message is a JSON object with three fields:

```typescript
{
  type: string;       // Event name (e.g., "chat:send")
  requestId?: string; // Client-generated correlation ID
  payload: object;    // Event-specific data
}
```

### Client → Server events

| Event | Payload | Description |
|-------|---------|-------------|
| `ping` | `{}` | Keepalive |
| `conversation:create` | `{}` | Create a new conversation |
| `conversation:list` | `{}` | List all conversations for this session |
| `conversation:history` | `{ conversationId }` | Load message history |
| `conversation:delete` | `{ conversationId }` | Delete a conversation |
| `chat:send` | `{ conversationId, content }` | Send a user message |
| `chat:stop` | `{ requestId }` | Abort an in-flight AI stream |

### Server → Client events

| Event | Payload | Description |
|-------|---------|-------------|
| `session:established` | `{ sessionId }` | Sent on connection |
| `pong` | `{}` | Reply to ping |
| `conversation:created` | `{ conversation }` | New conversation object |
| `conversation:listed` | `{ conversations[] }` | Full list |
| `conversation:history_loaded` | `{ conversationId, messages[] }` | Message history |
| `conversation:deleted` | `{ conversationId }` | Confirmation |
| `chat:token` | `{ conversationId, token }` | Single streamed token |
| `chat:message_complete` | `{ conversationId, message, usage }` | Stream finished |
| `chat:error` | `{ conversationId, message }` | Error during generation |
| `error` | `{ message }` | General error |

### Connection lifecycle

```
Client                              Server
  │                                    │
  │──── WS handshake ────────────────▶│
  │                                    │ Parse cookie → resolve/create session
  │◀──── session:established ─────────│
  │                                    │
  │──── conversation:list ───────────▶│
  │◀──── conversation:listed ─────────│
  │                                    │
  │──── chat:send ───────────────────▶│ Save user msg → DB
  │                                    │ Load history → AI provider
  │◀──── chat:token (×N) ────────────│ Stream tokens one-by-one
  │◀──── chat:token ──────────────────│
  │◀──── chat:token ──────────────────│
  │◀──── chat:message_complete ───────│ Save assistant msg → DB
  │                                    │
  │──── ping ─────────────────────────▶│
  │◀──── pong ────────────────────────│
  │                                    │
  │──── chat:stop ────────────────────▶│ Abort AI stream
```

### Heartbeat mechanism

Two-layer heartbeat prevents zombie connections:

1. **Server-side ping** (`ws.ping()` binary frame every 30s) — if the client doesn't respond with a pong within the next interval, the connection is terminated.
2. **Client-side ping** (JSON `{ type: "ping" }` every 25s) — keeps the connection alive through proxies/load balancers that have idle timeouts.

---

## Session Management

### How sessions work

```
┌──────────┐     Cookie: chainlit_sid=sess_abc123     ┌──────────┐
│  Browser  │ ──────────────────────────────────────▶ │  Server   │
│           │                                          │           │
│           │  1. HTTP GET /api/session                │           │
│           │     → reads cookie                       │           │
│           │     → looks up in sessions table         │           │
│           │     → if expired/missing: create new     │           │
│           │     → Set-Cookie: chainlit_sid=sess_xyz  │           │
│           │                                          │           │
│           │  2. WS upgrade GET /ws                   │           │
│           │     → same cookie sent via headers       │           │
│           │     → sessionFromUpgrade() reads it      │           │
│           │     → session attached to WS connection  │           │
└──────────┘                                          └──────────┘
```

- Sessions are stored in SQLite with a configurable TTL (default 72 hours).
- On every HTTP request or WS connection, the TTL is refreshed (sliding expiration).
- An hourly cleanup job deletes expired sessions and their cascaded conversations/messages.
- The session cookie is `httpOnly` (no JS access) and `sameSite: lax` (CSRF protection).

### Session → Conversation → Message hierarchy

```
Session (sess_abc)
  ├── Conversation (conv_001) "How do I deploy Docker?"
  │     ├── Message (msg_01) [user]      "How do I deploy Docker?"
  │     ├── Message (msg_02) [assistant] "Here are the steps..."
  │     └── Message (msg_03) [user]      "What about compose?"
  │
  └── Conversation (conv_002) "Explain WebSockets"
        ├── Message (msg_04) [user]      "Explain WebSockets"
        └── Message (msg_05) [assistant] "WebSocket is a protocol..."
```

---

## Conversation Persistence

### Database: SQLite with WAL mode

We use **better-sqlite3**, a synchronous C++ binding for SQLite. It's chosen because:

1. **No async overhead** — better-sqlite3 is synchronous, which is actually faster for SQLite (avoids libuv thread pool bottleneck).
2. **WAL mode** — Write-Ahead Logging allows concurrent readers while one writer proceeds, giving us ~5x throughput over default journal mode.
3. **Zero ops** — No separate database server to install, configure, or monitor.

### Schema

```sql
sessions
  ├── id          TEXT PK
  ├── user_id     TEXT (nullable, for future auth)
  ├── created_at  TEXT (ISO-8601)
  ├── expires_at  TEXT (ISO-8601)
  └── metadata    TEXT (JSON)

conversations
  ├── id          TEXT PK
  ├── session_id  TEXT FK → sessions.id (CASCADE DELETE)
  ├── title       TEXT
  ├── created_at  TEXT
  └── updated_at  TEXT

messages
  ├── id               TEXT PK
  ├── conversation_id  TEXT FK → conversations.id (CASCADE DELETE)
  ├── role             TEXT CHECK(user|assistant|system)
  ├── content          TEXT
  ├── created_at       TEXT
  └── metadata         TEXT (JSON: token counts, model, latency)
```

### Cascade deletes

When a session expires and gets cleaned up, all its conversations and messages are automatically deleted via `ON DELETE CASCADE` foreign keys. No orphaned data.

### Auto-titling

The first user message in a conversation is used to auto-generate the sidebar title (truncated to 80 chars). This mirrors the UX of ChatGPT where conversations are named after the first prompt.

---

## AI Streaming Pipeline

### Token-by-token flow

```
User sends "Explain TCP"
         │
         ▼
    ┌─────────────┐
    │  WS Handler  │  1. Validate + rate-limit
    │              │  2. Save user message to DB
    │              │  3. Load conversation history
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │ AI Provider  │  4. Build OpenAI messages array
    │              │  5. Call chat.completions.create({ stream: true })
    └──────┬──────┘
           │
           │  SSE stream from OpenAI
           │  data: {"choices":[{"delta":{"content":"TCP"}}]}
           │  data: {"choices":[{"delta":{"content":" is"}}]}
           │  data: {"choices":[{"delta":{"content":" a"}}]}
           │  ...
           │
           ▼
    ┌─────────────┐
    │  Callbacks   │  onToken("TCP")  → ws.send({ type: "chat:token", token: "TCP" })
    │              │  onToken(" is")  → ws.send({ type: "chat:token", token: " is" })
    │              │  onToken(" a")   → ws.send({ type: "chat:token", token: " a" })
    │              │  ...
    │              │  onComplete(fullText, usage) → save to DB + send chat:message_complete
    └─────────────┘
```

### Abort / "Stop Generating"

When the user clicks "Stop":

1. Client sends `{ type: "chat:stop", payload: { requestId: "req_xxx" } }`
2. Server looks up the `AbortController` for that requestId
3. Calls `abortController.abort()` → the OpenAI SDK throws an `AbortError`
4. The `for await` loop exits cleanly
5. Whatever tokens were already streamed remain in the UI

### Provider flexibility

The AI provider uses the official `openai` SDK, which works with any OpenAI-compatible endpoint:

- **OpenAI**: `https://api.openai.com/v1`
- **Azure OpenAI**: `https://your-resource.openai.azure.com/openai/deployments/your-model`
- **Ollama**: `http://localhost:11434/v1`
- **LM Studio**: `http://localhost:1234/v1`

Just change `AI_PROVIDER_URL` and `AI_API_KEY` in your `.env`.

---

## Nginx Reverse Proxy

### Why Nginx in front of Node.js?

| Capability | Node.js alone | With Nginx |
|-----------|--------------|------------|
| TLS termination | Possible but slower | Native, hardware-accelerated |
| Static file serving | Works | 2-5x faster with sendfile() |
| Gzip compression | Middleware overhead | Native, zero-copy |
| Rate limiting | In-process memory | Per-IP at the edge, before hitting app |
| Connection buffering | Unbuffered | Buffers slow clients, protects Node |

### WebSocket upgrade through Nginx

This is the most critical configuration. Without these two headers, WebSocket connections will fail silently:

```nginx
location /ws {
    proxy_pass http://app_backend;
    proxy_http_version 1.1;

    # These two headers are REQUIRED for WS upgrade
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Long timeout so the WS connection isn't killed
    proxy_read_timeout 86400s;
}
```

**How the upgrade works:**

1. Browser sends `GET /ws` with headers `Upgrade: websocket` and `Connection: Upgrade`
2. Nginx sees `proxy_set_header Upgrade $http_upgrade` → forwards the `Upgrade` header
3. Nginx sees `proxy_set_header Connection "upgrade"` → forwards `Connection: upgrade`
4. Node.js `ws` library receives the upgrade request
5. HTTP 101 Switching Protocols is returned
6. Nginx now acts as a transparent TCP proxy for the duration of the connection

---

## Docker & Productionization

### Multi-stage build

```dockerfile
# Stage 1: Build (has devDependencies + TypeScript compiler)
FROM node:20-slim AS builder
  → npm ci (all deps)
  → tsc (compile TS → JS)

# Stage 2: Production (slim, only runtime deps)
FROM node:20-slim AS production
  → npm ci --omit=dev (no devDeps)
  → COPY dist from builder
  → COPY public/
  → Non-root user
  → HEALTHCHECK
```

This gives us a production image that:
- Has no TypeScript compiler or dev tools
- Runs as a non-root user (`appuser`)
- Has a Docker health check hitting `/api/health`
- Is ~150MB instead of ~800MB

### Docker Compose topology

```
┌─────────────────────────────────────┐
│  docker-compose                      │
│                                      │
│   ┌──────────────┐                   │
│   │    nginx      │ :80 (public)     │
│   │  (alpine)     │                  │
│   └──────┬───────┘                   │
│          │ proxy_pass                │
│   ┌──────▼───────┐                   │
│   │     app       │ :3000 (internal) │
│   │  (node:slim)  │                  │
│   └──────┬───────┘                   │
│          │                           │
│   ┌──────▼───────┐                   │
│   │  app_data     │ (Docker volume)  │
│   │  (SQLite DB)  │                  │
│   └──────────────┘                   │
│                                      │
│   Network: internal (bridge)         │
└─────────────────────────────────────┘
```

### Running in production

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env with your AI_API_KEY and SESSION_SECRET

# 2. Build and start
docker compose up -d --build

# 3. Check health
curl http://localhost/api/health
# {"status":"ok","uptime":12.345}

# 4. View logs
docker compose logs -f app
```

---

## Security Considerations

| Layer | Measure | Implementation |
|-------|---------|----------------|
| Transport | TLS | Nginx ssl_certificate (enable in nginx.conf) |
| Headers | Helmet | Express helmet middleware (X-Frame-Options, CSP, etc.) |
| Session | httpOnly cookie | Cookie not accessible to JS; prevents XSS session theft |
| Session | sameSite: lax | Mitigates CSRF |
| Input | Zod validation | All WS messages are validated before processing |
| Rate limit | Dual layer | Nginx limit_req at edge + in-app per-session limiter |
| Container | Non-root | Docker runs as `appuser`, not root |
| DB | Parameterized queries | better-sqlite3 prepared statements prevent SQL injection |
| WS | Max payload | `maxPayload: 65536` prevents memory exhaustion |
| WS | Heartbeat timeout | Zombie connections are terminated after missed pong |

---

## Scaling Strategies

### Current: Single-server (handles ~1,000 concurrent connections)

SQLite + single Node.js process is sufficient for many use cases.

### Next level: Horizontal scaling

When you outgrow a single server:

```
                    ┌──────────┐
                    │   Load   │
                    │ Balancer │
                    └────┬─────┘
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │ App #1 │ │ App #2 │ │ App #3 │
         └───┬────┘ └───┬────┘ └───┬────┘
             └───────────┼─────────┘
                         ▼
                  ┌─────────────┐
                  │  PostgreSQL  │  (replace SQLite)
                  └─────────────┘
                  ┌─────────────┐
                  │    Redis     │  (session store + pub/sub for WS)
                  └─────────────┘
```

Changes needed:
1. **Replace SQLite with PostgreSQL** — swap `better-sqlite3` for `pg` + connection pool
2. **Redis for sessions** — shared session store across instances
3. **Redis pub/sub for WS** — when App #1 gets a token, publish to Redis; App #2 (which has the client's WS) subscribes and forwards it
4. **Sticky sessions** or **Redis adapter for ws** — ensures WS connections route consistently

These are well-understood patterns. The application's layered architecture (repositories, providers, handlers) makes swapping storage backends straightforward.

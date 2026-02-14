# BuildCraft AI - Architecture Documentation

## Overview

BuildCraft AI is an enterprise-grade AI-powered application builder that enables users to describe applications in natural language and receive production-ready generated code. The platform features real-time collaboration, live preview, one-click deployment, and multi-model AI support.

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
│  │  │  Shared: Zustand Stores | API Client | WebSocket    │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS / WSS
┌────────────────────────┴────────────────────────────────────────┐
│                       API Gateway                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Express.js Backend                           │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Middleware: Auth | Validation | Error | Rate Limit  │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │  │
│  │  │  Auth    │ │ Project  │ │    AI     │ │   Deploy   │  │  │
│  │  │ Routes   │ │ Routes   │ │  Routes   │ │   Routes   │  │  │
│  │  └──────────┘ └──────────┘ └───────────┘ └────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                     Service Layer                               │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐ ┌────────────┐  │
│  │   Auth     │ │  Project   │ │     AI      │ │   Deploy   │  │
│  │  Service   │ │  Service   │ │   Service   │ │  Service   │  │
│  └────────────┘ └────────────┘ └─────────────┘ └────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐                 │
│  │  Collab    │ │ Notifier   │ │   Event     │                 │
│  │  Service   │ │  Service   │ │    Bus      │                 │
│  └────────────┘ └────────────┘ └─────────────┘                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                  Infrastructure Layer                           │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐ ┌────────────┐  │
│  │ PostgreSQL │ │   Redis    │ │  WebSocket  │ │  Circuit   │  │
│  │   (Data)   │ │  (Cache)   │ │   Server    │ │  Breaker   │  │
│  └────────────┘ └────────────┘ └─────────────┘ └────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌─────────────┐                 │
│  │   Rate     │ │   Retry    │ │   CQRS      │                 │
│  │  Limiter   │ │  Strategy  │ │  Pattern    │                 │
│  └────────────┘ └────────────┘ └─────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer        | Technology                            |
|------------- |---------------------------------------|
| Frontend     | Next.js 14, React 18, TailwindCSS     |
| State        | Zustand                               |
| Backend      | Express.js, TypeScript                |
| Database     | PostgreSQL                            |
| Cache        | Redis                                 |
| Real-time    | Socket.IO (WebSocket)                 |
| AI           | OpenAI GPT-4, Anthropic Claude        |
| Auth         | JWT (access + refresh tokens), bcrypt |
| Validation   | Zod                                   |
| Monorepo     | Turborepo, npm workspaces             |
| Containers   | Docker, docker-compose                |
| Orchestration| Kubernetes (base manifests)           |

## Project Structure

```
buildcraft-ai/
├── packages/
│   ├── frontend/          # Next.js App Router frontend
│   │   ├── src/
│   │   │   ├── app/       # Page routes (App Router)
│   │   │   │   ├── (auth)/        # Auth group (login, register)
│   │   │   │   ├── (dashboard)/   # Dashboard group (projects, settings, profile)
│   │   │   │   └── (editor)/      # Editor group (project editor workspace)
│   │   │   ├── components/
│   │   │   │   ├── ui/        # Button, Input, Modal, Badge
│   │   │   │   ├── layout/    # Sidebar, Header
│   │   │   │   ├── chat/      # ChatPanel
│   │   │   │   ├── editor/    # FileTree, CodeEditor
│   │   │   │   └── preview/   # PreviewPanel
│   │   │   ├── lib/
│   │   │   │   ├── api/       # Axios HTTP client with interceptors
│   │   │   │   ├── stores/    # Zustand stores (auth, project)
│   │   │   │   ├── hooks/     # Custom React hooks
│   │   │   │   ├── utils/     # cn(), formatRelativeTime()
│   │   │   │   └── websocket/ # Socket.IO client
│   │   │   ├── styles/       # Global CSS with Tailwind
│   │   │   └── types/        # TypeScript type definitions
│   │   └── [config files]
│   │
│   ├── backend/           # Express.js API server
│   │   └── src/
│   │       ├── api/
│   │       │   ├── controllers/  # Auth, Project controllers
│   │       │   ├── routes/       # Route definitions
│   │       │   ├── middlewares/  # Auth, validation, error handling
│   │       │   └── validators/  # Zod request schemas
│   │       ├── core/
│   │       │   ├── config/      # Environment configuration
│   │       │   ├── errors/      # Custom error hierarchy
│   │       │   ├── events/      # Event bus (pub/sub)
│   │       │   ├── logger/      # Structured logging (Winston)
│   │       │   └── utils/       # Shared utilities
│   │       ├── services/
│   │       │   ├── ai/          # Multi-provider AI service
│   │       │   ├── auth/        # JWT + bcrypt auth service
│   │       │   ├── project/     # Project CRUD + code generation
│   │       │   ├── collaboration/ # Real-time collaboration
│   │       │   ├── deployment/  # Container-based deployment
│   │       │   └── notification/ # Multi-channel notifications
│   │       ├── infrastructure/
│   │       │   └── websocket/   # Socket.IO server setup
│   │       └── patterns/
│   │           ├── circuit-breaker/ # Fault tolerance
│   │           ├── retry/           # Exponential backoff
│   │           ├── rate-limiter/    # Token bucket algorithm
│   │           └── cqrs/           # Command/Query separation
│   │
│   └── shared/            # Shared types and utilities
│       └── src/
│           ├── types/     # User, Project, AI, API, Collaboration types
│           ├── constants/ # App-wide constants
│           ├── utils/     # Shared helper functions
│           └── validators/ # Shared Zod schemas
│
├── infrastructure/
│   ├── docker/            # Dockerfiles and docker-compose
│   └── k8s/base/          # Kubernetes manifests
│
└── docs/                  # Documentation
```

## Key Design Patterns

### 1. Circuit Breaker Pattern
Protects against cascading failures when calling external AI providers. States: CLOSED (normal) → OPEN (failing, reject calls) → HALF_OPEN (testing recovery).

```
Request → Circuit Breaker → AI Provider
              │
              ├─ CLOSED: Forward requests, track failures
              ├─ OPEN: Reject immediately, return fallback
              └─ HALF_OPEN: Allow one test request
```

### 2. CQRS (Command Query Responsibility Segregation)
Separates read and write operations for better scalability. Commands mutate state, Queries read state — each can be optimized independently.

### 3. Token Bucket Rate Limiter
Controls API request rates per user/IP using an in-memory token bucket algorithm with configurable capacity, refill rate, and burst limits.

### 4. Retry with Exponential Backoff
Handles transient failures in external service calls with configurable max attempts, base delay, backoff multiplier, and jitter.

### 5. Event-Driven Architecture
Typed event bus enables loose coupling between services. Events like `project.created`, `code.generated`, `user.login` propagate through the system.

## Authentication Flow

```
┌──────────┐     POST /auth/login      ┌──────────┐
│  Client  │ ─────────────────────────► │  Server  │
│          │     { email, password }    │          │
│          │                            │          │
│          │ ◄───────────────────────── │          │
│          │   { accessToken,          │          │
│          │     refreshToken, user }   │          │
│          │                            │          │
│          │  GET /api/* (Bearer token) │          │
│          │ ─────────────────────────► │          │
│          │                            │          │
│          │  POST /auth/refresh        │          │
│          │ ─────────────────────────► │          │
│          │  { refreshToken }          │          │
│          │ ◄───────────────────────── │          │
│          │  { newAccessToken }        │          │
└──────────┘                            └──────────┘
```

- Access tokens: Short-lived (15min), stored in memory
- Refresh tokens: Long-lived (7d), stored in httpOnly cookies
- Password hashing: bcrypt with configurable salt rounds
- Role-based access control: admin, member, viewer roles

## AI Code Generation Pipeline

```
User Prompt
    │
    ▼
┌─────────────────┐
│  Rate Limiter   │── Reject if quota exceeded
│  (per user)     │
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ Prompt Builder  │── Builds system prompt + context
│ (with context)  │   (framework, existing files)
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ Circuit Breaker │── Failover between providers
│                 │
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│  AI Provider    │── OpenAI GPT-4 / Claude
│  (streaming)    │
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│  Code Parser    │── Extracts files from response
│                 │
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│  File Updater   │── Applies changes to project
│                 │
└────────┬────────┘
         │
    ▼
Response with file changes + explanation
```

## Real-Time Collaboration

Uses Socket.IO for bidirectional communication:

- **Rooms**: Each project is a Socket.IO room
- **Presence**: Users joining/leaving rooms broadcast presence
- **Code sync**: File edits broadcast to all room members
- **Cursor tracking**: Cursor positions shared in real-time
- **Chat**: In-project messaging

## Deployment Architecture

```
┌───────────────────────────────────────────┐
│              Kubernetes Cluster           │
│                                           │
│  ┌─────────────┐    ┌─────────────┐      │
│  │  Frontend    │    │  Backend    │      │
│  │  (3 pods)    │    │  (3 pods)   │      │
│  │  Port 3000   │    │  Port 8000  │      │
│  └──────┬───────┘    └──────┬──────┘      │
│         │                   │             │
│  ┌──────┴───────────────────┴──────┐      │
│  │        ClusterIP Services       │      │
│  └─────────────────────────────────┘      │
│                                           │
│  ┌──────────────┐  ┌──────────────┐       │
│  │  PostgreSQL  │  │    Redis     │       │
│  │  (stateful)  │  │  (stateful)  │       │
│  └──────────────┘  └──────────────┘       │
└───────────────────────────────────────────┘
```

- Docker multi-stage builds for optimized images
- Kubernetes deployments with health checks and resource limits
- Horizontal pod autoscaling ready
- Environment-based configuration

## Environment Variables

See `.env.example` for all required configuration:
- Database connection (PostgreSQL)
- Redis connection
- JWT secrets and token TTLs
- AI provider API keys (OpenAI, Anthropic)
- Server port and CORS settings
- Logging level

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.example .env

# 3. Start infrastructure (PostgreSQL + Redis)
docker-compose -f infrastructure/docker/docker-compose.yml up -d postgres redis

# 4. Run development servers
npx turbo dev
```

## Scripts

| Command            | Description                    |
|--------------------|--------------------------------|
| `npm run dev`      | Start all packages in dev mode |
| `npm run build`    | Build all packages             |
| `npm run lint`     | Lint all packages              |
| `npm run test`     | Run all tests                  |
| `npm run typecheck`| TypeScript type checking       |

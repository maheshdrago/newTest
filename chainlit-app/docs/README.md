# Chainlit-WS

A **Chainlit-like conversational AI application** built from scratch with WebSockets, Node.js, TypeScript, SQLite, and Nginx.

No frameworks, no magic — every WebSocket frame, session cookie, and database query is hand-built so you can understand exactly how real-time chat applications work under the hood.

---

## Quick Start (Development)

```bash
cd chainlit-app

# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env
# Edit .env — at minimum set AI_API_KEY

# 3. Run in development mode (auto-restart on changes)
npm run dev
```

Open `http://localhost:3000` in your browser.

## Quick Start (Docker / Production)

```bash
cd chainlit-app

# 1. Configure
cp .env.example .env
# Edit .env with production values

# 2. Build and run
docker compose up -d --build

# 3. Access via Nginx
open http://localhost
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production server |
| `npm run migrate` | Run database migrations |
| `npm run typecheck` | Type-check without emitting |

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `DATABASE_PATH` | `./data/chainlit.db` | SQLite database file |
| `AI_PROVIDER_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `AI_API_KEY` | — | API key for the AI provider |
| `AI_MODEL` | `gpt-4o-mini` | Model to use |
| `SESSION_SECRET` | — | Secret for session management |
| `SESSION_TTL_HOURS` | `72` | Session expiry |
| `RATE_LIMIT_POINTS` | `30` | Max requests per duration window |
| `WS_HEARTBEAT_INTERVAL_MS` | `30000` | WebSocket heartbeat interval |

## Documentation

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a deep dive into:
- WebSocket protocol design
- Session management
- Conversation persistence with SQLite
- AI streaming pipeline
- Nginx reverse proxy configuration
- Docker production setup
- Security considerations
- Scaling strategies

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5
- **WebSocket**: `ws` library
- **Database**: SQLite via `better-sqlite3` (WAL mode)
- **AI**: OpenAI SDK (compatible with any OpenAI-like API)
- **HTTP**: Express 4
- **Proxy**: Nginx 1.27
- **Container**: Docker multi-stage build
- **Validation**: Zod
- **Security**: Helmet, rate-limiter-flexible

## License

MIT

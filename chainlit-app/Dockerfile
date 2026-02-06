# ─────────────────────────────────────────────────────────────
#  Multi-stage Dockerfile for Chainlit-WS
#
#  Stage 1: Build TypeScript → JavaScript
#  Stage 2: Production image (Node.js slim)
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Builder ──────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install deps first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:20-slim AS production

# better-sqlite3 needs these native libs at runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends libsqlite3-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Copy static assets
COPY public/ ./public/

# Create data directory for SQLite
RUN mkdir -p /app/data

# Non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const req = http.get('http://localhost:3000/api/health', (res) => { \
      process.exit(res.statusCode === 200 ? 0 : 1); \
    }); req.on('error', () => process.exit(1));"

CMD ["node", "dist/server.js"]

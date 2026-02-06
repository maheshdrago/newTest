// ─────────────────────────────────────────────────────────────
//  Main entry point
//
//  1. Creates an Express HTTP server (serves static + API)
//  2. Attaches a WebSocket server on the same port
//  3. Wires session handling across both transports
// ─────────────────────────────────────────────────────────────

import http from "http";
import express from "express";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import path from "path";

import { config } from "./config";
import { logger } from "./utils/logger";
import { getDb, closeDb } from "./db/connection";
import { SessionRepo } from "./db/repositories";
import { sessionMiddleware } from "./middleware/session";
import { sessionFromUpgrade } from "./middleware/session";
import { router } from "./http/routes";
import { handleConnection } from "./ws/handler";

// ── Bootstrap ────────────────────────────────────────────────

// Initialise DB (runs migrations on first call)
getDb();

const app = express();

// Security headers (relaxed CSP for dev)
app.use(
  helmet({
    contentSecurityPolicy: config.isDev
      ? false
      : {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "ws:", "wss:"],
          },
        },
  })
);

// Body parsing (for future REST endpoints)
app.use(express.json());

// Static files
app.use(express.static(path.join(process.cwd(), "public")));

// Session middleware (sets req.session)
app.use(sessionMiddleware);

// Routes
app.use(router);

// ── HTTP + WS server ─────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: config.ws.maxPayloadBytes,
});

wss.on("connection", (ws, req) => {
  const session = sessionFromUpgrade(req);
  handleConnection(ws, session);
});

// ── Session cleanup cron (every hour) ────────────────────────

setInterval(() => {
  const deleted = SessionRepo.deleteExpired();
  if (deleted > 0) {
    logger.info("Cleaned up expired sessions", { deleted });
  }
}, 3600_000);

// ── Start listening ──────────────────────────────────────────

server.listen(config.port, () => {
  logger.info(`Server running on http://localhost:${config.port}`, {
    env: config.nodeEnv,
  });
  logger.info(`WebSocket endpoint: ws://localhost:${config.port}/ws`);
});

// ── Graceful shutdown ────────────────────────────────────────

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  wss.close(() => {
    logger.info("WebSocket server closed");
  });

  server.close(() => {
    logger.info("HTTP server closed");
    closeDb();
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

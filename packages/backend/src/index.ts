// Must be imported FIRST — patches Express to catch async errors without try/catch
import 'express-async-errors';

import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './core/config';
import { logger } from './core/logger';
import { requestContext } from './api/middlewares/request-context';
import { errorHandler } from './api/middlewares/error-handler';
import { globalRateLimiter } from './patterns/rate-limiter';
import { eventBus } from './core/events';
import { getDatabase, destroyDatabase } from './infrastructure/database';
import { getRedisConnection } from './infrastructure/queue/connection';
import { WebSocketManager } from './infrastructure/websocket';
import { startScheduledTasks, stopScheduledTasks } from './infrastructure/scheduler';

import authRoutes from './api/routes/auth';
import projectRoutes from './api/routes/projects';
import healthRoutes from './api/routes/health';

// ---------------------------------------------------------------------------
// Express app setup
// ---------------------------------------------------------------------------
const app = express();

// Security headers (P1 fix: helmet was in package.json but never applied)
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for dev — enable in production
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: config.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Body parsing with size limits (P1 fix: prevent large payload DoS)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request context (generates requestId, logs duration)
app.use(requestContext);

// Global rate limiter
app.use(globalRateLimiter);

// Trust proxy for correct IP detection behind load balancer
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/v1', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);

// ---------------------------------------------------------------------------
// Error handler (must be last middleware)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// HTTP + WebSocket server
// ---------------------------------------------------------------------------
const server = http.createServer(app);

// Export wsManager so health routes can reference it
export const wsManager = new WebSocketManager(server);

// ---------------------------------------------------------------------------
// Graceful shutdown (P1 fix: handle SIGTERM/SIGINT properly)
// ---------------------------------------------------------------------------
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // 1. Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // 2. Give in-flight requests time to complete (10s)
  const forceTimeout = setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  try {
    // 3. Stop scheduled tasks
    stopScheduledTasks();

    // 4. Disconnect event bus (closes Redis pub/sub)
    await eventBus.disconnect();
    logger.info('Event bus disconnected');

    // 4. Close database pool
    await destroyDatabase();
    logger.info('Database pool closed');

    // 5. Close Redis connection for queues
    const redis = getRedisConnection();
    redis.disconnect();
    logger.info('Redis disconnected');

    clearTimeout(forceTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: (err as Error).message });
    clearTimeout(forceTimeout);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = config.BACKEND_PORT || 4000;
const HOST = config.BACKEND_HOST || '0.0.0.0';

async function start() {
  try {
    // Connect event bus to Redis
    await eventBus.connect();
    logger.info('Event bus connected');

    // Verify database connection
    const db = getDatabase();
    await db.raw('SELECT 1');
    logger.info('Database connection verified');

    // Start scheduled tasks (session cleanup, etc.)
    startScheduledTasks();

    server.listen(PORT, () => {
      logger.info(`BuildCraft AI backend running on http://${HOST}:${PORT}`);
      logger.info(`Health: http://${HOST}:${PORT}/api/v1/health`);
      logger.info(`Environment: ${config.NODE_ENV}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

start();

export { app, server };

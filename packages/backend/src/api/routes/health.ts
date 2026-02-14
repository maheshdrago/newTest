import { Router, Request, Response } from 'express';
import { aiService } from '../../services/ai';
import { getWebSocketManager } from '../../infrastructure/websocket';
import { getDatabase } from '../../infrastructure/database';
import { getRedisConnection } from '../../infrastructure/queue/connection';
import { logger } from '../../core/logger';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

router.get('/health/detailed', async (_req: Request, res: Response) => {
  const memUsage = process.memoryUsage();

  // Check DB connectivity
  let dbStatus = 'unknown';
  try {
    const db = getDatabase();
    await db.raw('SELECT 1');
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  // Check Redis connectivity
  let redisStatus = 'unknown';
  try {
    const redis = getRedisConnection();
    await redis.ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'disconnected';
  }

  const wsManager = getWebSocketManager();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: { status: dbStatus },
      redis: { status: redisStatus },
      ai: {
        circuitBreaker: aiService.getCircuitBreakerStatus(),
      },
      websocket: wsManager ? wsManager.getStats() : { status: 'not_initialized' },
    },
    system: {
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      },
      pid: process.pid,
      nodeVersion: process.version,
    },
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  // Readiness check for Kubernetes — verify actual connectivity
  const checks: Record<string, boolean> = {};

  try {
    const db = getDatabase();
    await db.raw('SELECT 1');
    checks.database = true;
  } catch (err) {
    checks.database = false;
    logger.warn('Readiness: DB check failed', { error: (err as Error).message });
  }

  try {
    const redis = getRedisConnection();
    await redis.ping();
    checks.redis = true;
  } catch (err) {
    checks.redis = false;
    logger.warn('Readiness: Redis check failed', { error: (err as Error).message });
  }

  const isReady = Object.values(checks).every(Boolean);
  if (isReady) {
    res.json({ status: 'ready', checks });
  } else {
    res.status(503).json({ status: 'not_ready', checks });
  }
});

export default router;

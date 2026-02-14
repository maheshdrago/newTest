import { Router, Request, Response } from 'express';
import { aiService } from '../../services/ai';
import { wsManager } from '../../infrastructure/websocket';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

router.get('/health/detailed', (_req: Request, res: Response) => {
  const memUsage = process.memoryUsage();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      ai: {
        circuitBreaker: aiService.getCircuitBreakerStatus(),
      },
      websocket: wsManager.getStats(),
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

router.get('/ready', (_req: Request, res: Response) => {
  // Readiness check for Kubernetes
  const isReady = true; // Add actual checks here (DB, Redis, etc.)
  if (isReady) {
    res.json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not_ready' });
  }
});

export default router;

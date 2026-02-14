import { logger } from '../../core/logger';
import { SessionRepository } from '../database/repositories/session.repository';

let sessionCleanupTimer: NodeJS.Timeout | null = null;

const SESSION_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

export function startScheduledTasks(): void {
  // Session cleanup: remove expired and revoked sessions every hour
  sessionCleanupTimer = setInterval(async () => {
    try {
      const sessionRepo = new SessionRepository();
      const cleaned = await sessionRepo.cleanupExpired();
      if (cleaned > 0) {
        logger.info(`Session cleanup: removed ${cleaned} expired/revoked sessions`);
      }
    } catch (err) {
      logger.error('Session cleanup failed', { error: (err as Error).message });
    }
  }, SESSION_CLEANUP_INTERVAL);

  // Run immediately on startup
  setImmediate(async () => {
    try {
      const sessionRepo = new SessionRepository();
      const cleaned = await sessionRepo.cleanupExpired();
      logger.info(`Initial session cleanup: removed ${cleaned} expired/revoked sessions`);
    } catch (err) {
      logger.error('Initial session cleanup failed', { error: (err as Error).message });
    }
  });

  logger.info('Scheduled tasks started');
}

export function stopScheduledTasks(): void {
  if (sessionCleanupTimer) {
    clearInterval(sessionCleanupTimer);
    sessionCleanupTimer = null;
    logger.info('Scheduled tasks stopped');
  }
}

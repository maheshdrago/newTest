import { Job } from 'bullmq';
import { createWorker } from '../connection';
import { QUEUE_NAMES } from '../queues';
import { logger } from '../../../core/logger';
import { getDatabase } from '../../database';
import { sanitizeHtml } from '../../../core/security/sanitize';

export interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { userId, type, title, message, metadata = {} } = job.data;
  const db = getDatabase();

  try {
    // Persist notification to database
    await db('notifications').insert({
      user_id: userId,
      type,
      title: sanitizeHtml(title),
      message: sanitizeHtml(message),
      is_read: false,
      metadata: JSON.stringify(metadata),
    });

    logger.info('Notification persisted', { userId, type, title });
  } catch (error: any) {
    logger.error('Failed to persist notification', { userId, type, error: error.message });
    throw error;
  }
}

export const notificationWorker = createWorker(QUEUE_NAMES.NOTIFICATION, processNotification, 5);

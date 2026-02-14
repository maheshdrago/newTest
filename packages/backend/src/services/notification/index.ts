import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';
import { getDatabase } from '../../infrastructure/database';
import { notificationQueue } from '../../infrastructure/queue';

const db = getDatabase();

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  metadata: Record<string, any>;
  created_at: Date;
}

export class NotificationService {
  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.subscribe(EventTypes.PROJECT_DEPLOYED, (event) => {
      const { projectId, userId, url } = event.payload as any;
      if (userId) {
        this.createNotification(userId, 'deployment', 'Deployment Complete', `Your project has been deployed at ${url || 'buildcraft.app'}`);
      }
    });

    eventBus.subscribe(EventTypes.AI_GENERATION_COMPLETED, (event) => {
      const { projectId, userId, filesChanged } = event.payload as any;
      if (userId) {
        this.createNotification(userId, 'generation', 'Code Generated', `${filesChanged || 'Multiple'} files have been generated for your project.`);
      }
    });

    eventBus.subscribe(EventTypes.AI_GENERATION_FAILED, (event) => {
      const { projectId, userId, error } = event.payload as any;
      if (userId) {
        this.createNotification(userId, 'error', 'Generation Failed', `Code generation failed: ${error || 'Unknown error'}`);
      }
    });
  }

  async createNotification(userId: string, type: string, title: string, message: string, metadata: Record<string, any> = {}): Promise<void> {
    try {
      // Queue the notification for async delivery (email, push, etc.)
      await notificationQueue.add('send', { userId, type, title, message, metadata });
    } catch (err) {
      logger.warn('Failed to queue notification', { userId, type, error: (err as Error).message });
    }
  }

  async getNotifications(userId: string, limit = 50, offset = 0): Promise<Notification[]> {
    return db('notifications')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    const updated = await db('notifications')
      .where({ id: notificationId, user_id: userId })
      .update({ is_read: true, updated_at: new Date() });
    return updated > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    return db('notifications')
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true, updated_at: new Date() });
  }
}

export const notificationService = new NotificationService();

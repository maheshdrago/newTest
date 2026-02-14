import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

const notifications = new Map<string, Notification[]>();

export class NotificationService {
  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.subscribe(EventTypes.PROJECT_DEPLOYED, (event) => {
      const { projectId, url } = event.payload as any;
      logger.info('Sending deployment notification', { projectId });
    });

    eventBus.subscribe(EventTypes.AI_GENERATION_COMPLETED, (event) => {
      const { projectId, filesChanged } = event.payload as any;
      logger.info('Sending generation complete notification', { projectId, filesChanged });
    });

    eventBus.subscribe(EventTypes.AI_GENERATION_FAILED, (event) => {
      const { projectId, error } = event.payload as any;
      logger.info('Sending generation failure notification', { projectId, error });
    });
  }

  async createNotification(userId: string, type: string, title: string, message: string): Promise<Notification> {
    const notification: Notification = {
      id: `notif_${Date.now().toString(36)}`,
      userId,
      type,
      title,
      message,
      read: false,
      createdAt: new Date(),
    };

    const userNotifications = notifications.get(userId) || [];
    userNotifications.unshift(notification);
    notifications.set(userId, userNotifications.slice(0, 100)); // Keep last 100

    return notification;
  }

  getNotifications(userId: string): Notification[] {
    return notifications.get(userId) || [];
  }

  markAsRead(userId: string, notificationId: string): void {
    const userNotifications = notifications.get(userId);
    if (!userNotifications) return;
    const notification = userNotifications.find(n => n.id === notificationId);
    if (notification) notification.read = true;
  }
}

export const notificationService = new NotificationService();

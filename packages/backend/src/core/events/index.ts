import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../logger';

export interface DomainEvent {
  type: string;
  payload: Record<string, any>;
  timestamp: Date;
  source?: string;
}

const CHANNEL_PREFIX = 'buildcraft:events:';

class DistributedEventBus extends EventEmitter {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private instanceId: string;
  private connected = false;

  constructor() {
    super();
    this.instanceId = `instance-${process.pid}-${Date.now()}`;
    this.setMaxListeners(100);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      this.publisher = new Redis(config.REDIS_URL, { lazyConnect: true });
      this.subscriber = new Redis(config.REDIS_URL, { lazyConnect: true });

      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);

      // Subscribe to the pattern for all buildcraft events
      await this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`);

      this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
        try {
          const event: DomainEvent & { _source: string } = JSON.parse(message);
          // Don't re-emit events published by this instance (prevent loops)
          if (event._source === this.instanceId) return;
          const eventType = channel.replace(CHANNEL_PREFIX, '');
          this.emit(eventType, event);
          this.emit('*', event); // wildcard listener
        } catch (err) {
          logger.error('Failed to parse event message', { channel, error: (err as Error).message });
        }
      });

      this.connected = true;
      logger.info('Distributed event bus connected', { instanceId: this.instanceId });
    } catch (err) {
      logger.error('Failed to connect event bus', { error: (err as Error).message });
      // Fallback to local-only mode
      this.connected = false;
    }
  }

  async publish(event: DomainEvent): Promise<void> {
    const channel = `${CHANNEL_PREFIX}${event.type}`;
    const message = JSON.stringify({ ...event, _source: this.instanceId });

    // Always emit locally
    this.emit(event.type, event);
    this.emit('*', event);

    // Publish to Redis for cross-instance distribution
    if (this.publisher && this.connected) {
      try {
        await this.publisher.publish(channel, message);
      } catch (err) {
        logger.warn('Failed to publish event to Redis, local-only', { type: event.type, error: (err as Error).message });
      }
    }
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    this.on(eventType, handler);
  }

  unsubscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    this.off(eventType, handler);
  }

  async disconnect(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.punsubscribe();
      this.subscriber.disconnect();
    }
    if (this.publisher) {
      this.publisher.disconnect();
    }
    this.connected = false;
    logger.info('Event bus disconnected');
  }
}

export const eventBus = new DistributedEventBus();

// Event Types
export const EventTypes = {
  // Project Events
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',
  PROJECT_DEPLOYED: 'project.deployed',

  // AI Events
  AI_GENERATION_STARTED: 'ai.generation.started',
  AI_GENERATION_COMPLETED: 'ai.generation.completed',
  AI_GENERATION_FAILED: 'ai.generation.failed',

  // User Events
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged_in',
  USER_PLAN_UPGRADED: 'user.plan.upgraded',

  // Collaboration Events
  COLLABORATION_SESSION_STARTED: 'collaboration.session.started',
  COLLABORATION_USER_JOINED: 'collaboration.user.joined',
  COLLABORATION_USER_LEFT: 'collaboration.user.left',

  // System Events
  CIRCUIT_BREAKER_OPENED: 'system.circuit_breaker.opened',
  CIRCUIT_BREAKER_CLOSED: 'system.circuit_breaker.closed',
  HEALTH_CHECK_FAILED: 'system.health_check.failed',
} as const;

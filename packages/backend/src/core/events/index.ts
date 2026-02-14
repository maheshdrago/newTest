import { EventEmitter } from 'events';
import { logger } from '../logger';

export interface DomainEvent {
  type: string;
  payload: unknown;
  timestamp: Date;
  correlationId?: string;
}

class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  publish(event: DomainEvent): void {
    logger.debug(`Event published: ${event.type}`, { correlationId: event.correlationId });
    this.emit(event.type, event);
    this.emit('*', event); // Wildcard listener for logging/monitoring
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    logger.debug(`Event handler registered: ${eventType}`);
    this.on(eventType, handler);
  }

  subscribeOnce(eventType: string, handler: (event: DomainEvent) => void): void {
    this.once(eventType, handler);
  }
}

export const eventBus = EventBus.getInstance();

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

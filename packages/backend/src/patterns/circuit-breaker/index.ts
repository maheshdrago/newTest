import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';

export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing recovery
}

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  recoveryTimeout: number;
  successThreshold: number;
  monitorInterval?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly options: Required<CircuitBreakerOptions>;
  private readonly cbLogger;

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      monitorInterval: 60000,
      ...options,
    };
    this.cbLogger = logger.child({ component: 'CircuitBreaker', name: options.name });
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.options.recoveryTimeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        this.cbLogger.warn('Circuit is OPEN, rejecting request');
        if (fallback) return fallback();
        throw new Error(`Circuit breaker [${this.options.name}] is OPEN`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) return fallback();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.cbLogger.info(`State transition: ${oldState} -> ${newState}`);

    if (newState === CircuitState.OPEN) {
      this.successCount = 0;
      eventBus.publish({
        type: EventTypes.CIRCUIT_BREAKER_OPENED,
        payload: { name: this.options.name, failureCount: this.failureCount },
        timestamp: new Date(),
      });
    } else if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      eventBus.publish({
        type: EventTypes.CIRCUIT_BREAKER_CLOSED,
        payload: { name: this.options.name },
        timestamp: new Date(),
      });
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      name: this.options.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
    };
  }
}

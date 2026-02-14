import { logger } from '../../core/logger';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error) => void;
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (opts.retryableErrors && !opts.retryableErrors.some(e => lastError!.message.includes(e))) {
        throw lastError;
      }

      if (attempt === opts.maxAttempts) break;

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1) + Math.random() * 1000,
        opts.maxDelayMs
      );

      logger.warn(`Retry attempt ${attempt}/${opts.maxAttempts} after ${delay}ms`, {
        error: lastError.message,
      });

      opts.onRetry?.(attempt, lastError);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function retryable(options: Partial<RetryOptions> = {}) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: unknown[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };
    return descriptor;
  };
}

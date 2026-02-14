import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../core/errors';
import { logger } from '../../core/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as any).requestId || 'unknown';

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.reduce((acc, e) => {
      acc[e.path.join('.')] = e.message;
      return acc;
    }, {} as Record<string, string>);

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details,
      },
      meta: { requestId, timestamp: Date.now() },
    });
    return;
  }

  // Handle operational errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[${requestId}] ${err.message}`, { code: err.code, stack: err.stack });
    } else {
      logger.warn(`[${requestId}] ${err.message}`, { code: err.code });
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      meta: { requestId, timestamp: Date.now() },
    });
    return;
  }

  // Handle unexpected errors
  logger.error(`[${requestId}] Unexpected error:`, { error: err.message, stack: err.stack });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    },
    meta: { requestId, timestamp: Date.now() },
  });
}

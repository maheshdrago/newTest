import { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '../../core/utils';
import { logger } from '../../core/logger';

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
  const startTime = Date.now();

  (req as any).requestId = requestId;
  (req as any).startTime = startTime;
  res.setHeader('X-Request-Id', requestId);

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  });

  next();
}

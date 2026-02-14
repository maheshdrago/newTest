import rateLimit from 'express-rate-limit';
import { config } from '../../core/config';
import { RateLimitError } from '../../core/errors';

export const globalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown',
});

export const aiRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.AI_RATE_LIMIT_MAX_REQUESTS,
  message: { success: false, error: { code: 'AI_RATE_LIMIT_EXCEEDED', message: 'AI generation rate limit exceeded' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req as any).userId || req.ip || 'unknown',
  handler: (_req, _res, _next) => {
    throw new RateLimitError('AI generation rate limit exceeded. Please try again later.');
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'AUTH_RATE_LIMIT', message: 'Too many auth attempts' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export function createCustomRateLimiter(windowMs: number, max: number) {
  return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false });
}

// ─────────────────────────────────────────────────────────────
//  In-memory rate limiter per session (uses rate-limiter-flexible)
//  In production, swap the MemoryStore for Redis.
// ─────────────────────────────────────────────────────────────

import { RateLimiterMemory } from "rate-limiter-flexible";
import { config } from "../config";
import { logger } from "../utils/logger";

const limiter = new RateLimiterMemory({
  points: config.rateLimit.points,
  duration: config.rateLimit.durationSeconds,
});

/**
 * Returns `true` if the request is allowed, `false` if rate-limited.
 */
export async function checkRateLimit(key: string): Promise<boolean> {
  try {
    await limiter.consume(key);
    return true;
  } catch {
    logger.warn("Rate limit exceeded", { key });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
//  Minimal structured logger (no external deps)
//  In production, replace with pino / winston as needed.
// ─────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? "debug";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: LogLevel, msg: string, extra?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${msg}`;
  if (extra && Object.keys(extra).length > 0) {
    return `${base} ${JSON.stringify(extra)}`;
  }
  return base;
}

export const logger = {
  debug(msg: string, extra?: Record<string, unknown>) {
    if (shouldLog("debug")) console.debug(formatMessage("debug", msg, extra));
  },
  info(msg: string, extra?: Record<string, unknown>) {
    if (shouldLog("info")) console.info(formatMessage("info", msg, extra));
  },
  warn(msg: string, extra?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(formatMessage("warn", msg, extra));
  },
  error(msg: string, extra?: Record<string, unknown>) {
    if (shouldLog("error")) console.error(formatMessage("error", msg, extra));
  },
};

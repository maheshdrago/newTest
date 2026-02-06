import dotenv from "dotenv";
import path from "path";

dotenv.config();

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  return raw ? parseInt(raw, 10) : fallback;
}

export const config = {
  port: envInt("PORT", 3000),
  nodeEnv: env("NODE_ENV", "development"),
  isDev: env("NODE_ENV", "development") === "development",

  db: {
    path: env("DATABASE_PATH", path.join(process.cwd(), "data", "chainlit.db")),
  },

  ai: {
    baseUrl: env("AI_PROVIDER_URL", "https://api.openai.com/v1"),
    apiKey: env("AI_API_KEY", ""),
    model: env("AI_MODEL", "gpt-4o-mini"),
  },

  session: {
    secret: env("SESSION_SECRET", "dev-secret-change-me"),
    ttlHours: envInt("SESSION_TTL_HOURS", 72),
  },

  rateLimit: {
    points: envInt("RATE_LIMIT_POINTS", 30),
    durationSeconds: envInt("RATE_LIMIT_DURATION_SECONDS", 60),
  },

  ws: {
    heartbeatIntervalMs: envInt("WS_HEARTBEAT_INTERVAL_MS", 30_000),
    maxPayloadBytes: envInt("WS_MAX_PAYLOAD_BYTES", 65_536),
  },
} as const;

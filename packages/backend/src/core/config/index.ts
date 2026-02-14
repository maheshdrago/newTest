import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_NAME: z.string().default('BuildCraft AI'),
  
  // Server
  BACKEND_PORT: z.coerce.number().default(4000),
  BACKEND_HOST: z.string().default('0.0.0.0'),
  
  // Database
  DATABASE_URL: z.string().default('postgresql://buildcraft:buildcraft@localhost:5432/buildcraft'),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(10),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // JWT
  JWT_SECRET: z.string().default('dev-secret-change-in-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  
  // AI
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  AI_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(20),
  
  // Circuit Breaker
  CB_FAILURE_THRESHOLD: z.coerce.number().default(5),
  CB_RECOVERY_TIMEOUT: z.coerce.number().default(30000),
  CB_SUCCESS_THRESHOLD: z.coerce.number().default(3),
  
  // WebSocket
  WS_HEARTBEAT_INTERVAL: z.coerce.number().default(30000),
  WS_MAX_CONNECTIONS: z.coerce.number().default(10000),
  
  // Monitoring
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  ENABLE_METRICS: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().default(9090),
  SENTRY_DSN: z.string().default(''),
  
  // Storage
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().default('buildcraft-storage'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().default(''),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),

  // Database (parsed from DATABASE_URL)
  DATABASE_HOST: z.string().default('localhost'),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_USER: z.string().default('buildcraft'),
  DATABASE_PASSWORD: z.string().default('buildcraft'),
  DATABASE_NAME: z.string().default('buildcraft'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Docker / Sandbox
  DOCKER_HOST: z.string().default('unix:///var/run/docker.sock'),
  SANDBOX_MAX_MEMORY: z.string().default('256m'),
  SANDBOX_MAX_CPUS: z.string().default('0.5'),
  SANDBOX_TIMEOUT_MS: z.coerce.number().default(300000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof envSchema>;

import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../../core/config';
import { logger } from '../../core/logger';

let redisConnection: Redis;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
    });
    redisConnection.on('error', (err) => logger.error('Redis connection error', { error: err.message }));
    redisConnection.on('connect', () => logger.info('Redis connected'));
  }
  return redisConnection;
}

export function createQueue(name: string): Queue {
  return new Queue(name, { connection: getRedisConnection(), defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800, count: 5000 },
  }});
}

export function createWorker(name: string, processor: any, concurrency = 3): Worker {
  const worker = new Worker(name, processor, {
    connection: getRedisConnection(),
    concurrency,
    limiter: { max: 10, duration: 1000 },
  });
  worker.on('completed', (job) => logger.info(`Job ${job.id} completed`, { queue: name }));
  worker.on('failed', (job, err) => logger.error(`Job ${job?.id} failed`, { queue: name, error: err.message }));
  return worker;
}

export function createQueueEvents(name: string): QueueEvents {
  return new QueueEvents(name, { connection: getRedisConnection() });
}

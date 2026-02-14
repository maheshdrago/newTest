import knex, { Knex } from 'knex';
import { config } from '../../core/config';
import { logger } from '../../core/logger';

let db: Knex;

export function getDatabase(): Knex {
  if (!db) {
    db = knex({
      client: 'pg',
      connection: {
        host: config.DATABASE_HOST,
        port: config.DATABASE_PORT,
        user: config.DATABASE_USER,
        password: config.DATABASE_PASSWORD,
        database: config.DATABASE_NAME,
        ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      },
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
      },
      migrations: {
        directory: './migrations',
        tableName: 'knex_migrations',
      },
      seeds: {
        directory: './seeds',
      },
    });

    db.on('query-error', (error: Error) => {
      logger.error('Database query error', { error: error.message });
    });
  }
  return db;
}

export async function destroyDatabase(): Promise<void> {
  if (db) {
    await db.destroy();
    logger.info('Database connection pool destroyed');
  }
}

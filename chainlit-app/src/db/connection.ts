// ─────────────────────────────────────────────────────────────
//  SQLite connection singleton using better-sqlite3
//  better-sqlite3 is synchronous and avoids callback hell;
//  it uses a native C++ binding for high performance.
// ─────────────────────────────────────────────────────────────

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { logger } from "../utils/logger";
import { SCHEMA_SQL } from "./schema";

let db: Database.Database | null = null;

/**
 * Returns the singleton database connection, creating it
 * (and running migrations) on first call.
 */
export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(config.db.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info("Created database directory", { dir });
  }

  db = new Database(config.db.path);

  // Performance pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");

  // Run schema (idempotent via IF NOT EXISTS)
  db.exec(SCHEMA_SQL);
  logger.info("Database initialised", { path: config.db.path });

  return db;
}

/** Gracefully close the database (call on SIGTERM / SIGINT) */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info("Database connection closed");
  }
}

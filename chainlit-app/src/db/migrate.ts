// ─────────────────────────────────────────────────────────────
//  Standalone migration runner — `npm run migrate`
// ─────────────────────────────────────────────────────────────

import { getDb, closeDb } from "./connection";
import { logger } from "../utils/logger";

function main() {
  logger.info("Running database migrations...");
  getDb(); // initialises DB + runs SCHEMA_SQL
  logger.info("Migrations complete.");
  closeDb();
}

main();

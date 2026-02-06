// ─────────────────────────────────────────────────────────────
//  SQLite schema – run once via migrate.ts
//  Tables: sessions, conversations, messages
// ─────────────────────────────────────────────────────────────

export const SCHEMA_SQL = `
-- Pragma for WAL mode (better concurrent read performance)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  metadata    TEXT  -- JSON blob
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON sessions(expires_at);

-- ── Conversations (threads) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New conversation',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_session
  ON conversations(session_id);

-- ── Messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content          TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  metadata         TEXT  -- JSON blob (token usage, model, latency, etc.)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at ASC);
`;

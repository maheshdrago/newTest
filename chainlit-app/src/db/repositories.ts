// ─────────────────────────────────────────────────────────────
//  Data-access layer — thin wrappers over prepared statements
// ─────────────────────────────────────────────────────────────

import { nanoid } from "nanoid";
import { getDb } from "./connection";
import { config } from "../config";
import type { Session, Conversation, ChatMessage } from "../types";

// ── Session repository ───────────────────────────────────────

export const SessionRepo = {
  create(userId: string | null = null): Session {
    const db = getDb();
    const id = `sess_${nanoid()}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + config.session.ttlHours * 3600_000
    ).toISOString();

    db.prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, metadata)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, userId, now, expiresAt, null);

    return { id, userId, createdAt: now, expiresAt, metadata: null };
  },

  findById(id: string): Session | undefined {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM sessions WHERE id = ? AND expires_at > datetime('now')`)
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return undefined;
    return mapSession(row);
  },

  /** Touch the session so it doesn't expire while active */
  refresh(id: string): void {
    const db = getDb();
    const expiresAt = new Date(
      Date.now() + config.session.ttlHours * 3600_000
    ).toISOString();
    db.prepare(`UPDATE sessions SET expires_at = ? WHERE id = ?`).run(expiresAt, id);
  },

  deleteExpired(): number {
    const db = getDb();
    const info = db
      .prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`)
      .run();
    return info.changes;
  },
};

// ── Conversation repository ──────────────────────────────────

export const ConversationRepo = {
  create(sessionId: string, title = "New conversation"): Conversation {
    const db = getDb();
    const id = `conv_${nanoid()}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO conversations (id, session_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, sessionId, title, now, now);

    return { id, sessionId, title, createdAt: now, updatedAt: now };
  },

  listBySession(sessionId: string): Conversation[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM conversations WHERE session_id = ? ORDER BY updated_at DESC`
      )
      .all(sessionId) as Record<string, unknown>[];

    return rows.map(mapConversation);
  },

  findById(id: string): Conversation | undefined {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapConversation(row) : undefined;
  },

  updateTitle(id: string, title: string): void {
    const db = getDb();
    db.prepare(
      `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title, id);
  },

  touch(id: string): void {
    const db = getDb();
    db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(
      id
    );
  },

  delete(id: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  },
};

// ── Message repository ───────────────────────────────────────

export const MessageRepo = {
  create(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata: Record<string, unknown> | null = null
  ): ChatMessage {
    const db = getDb();
    const id = `msg_${nanoid()}`;
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, conversationId, role, content, now, metadata ? JSON.stringify(metadata) : null);

    // Also touch the parent conversation's updated_at
    ConversationRepo.touch(conversationId);

    return { id, conversationId, role, content, createdAt: now, metadata };
  },

  listByConversation(conversationId: string, limit = 200, offset = 0): ChatMessage[] {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ASC
         LIMIT ? OFFSET ?`
      )
      .all(conversationId, limit, offset) as Record<string, unknown>[];

    return rows.map(mapMessage);
  },

  countByConversation(conversationId: string): number {
    const db = getDb();
    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ?`)
      .get(conversationId) as { cnt: number };
    return row.cnt;
  },
};

// ── Row mappers ──────────────────────────────────────────────

function mapSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  };
}

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    title: row.title as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    role: row.role as ChatMessage["role"],
    content: row.content as string,
    createdAt: row.created_at as string,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
  };
}

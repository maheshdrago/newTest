// ─────────────────────────────────────────────────────────────
//  Core domain types for the Chainlit-like WebSocket chat app
// ─────────────────────────────────────────────────────────────

/** Roles in a conversation turn */
export type MessageRole = "user" | "assistant" | "system";

/** A single chat message persisted in the DB */
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  /** ISO-8601 timestamp */
  createdAt: string;
  /** Optional metadata (token counts, model info, etc.) */
  metadata: Record<string, unknown> | null;
}

/** A conversation (thread) that groups messages */
export interface Conversation {
  id: string;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** A session ties a browser tab / user agent to conversations */
export interface Session {
  id: string;
  /** Fingerprint or anonymous user identifier */
  userId: string | null;
  createdAt: string;
  expiresAt: string;
  metadata: Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────
//  WebSocket protocol types
// ─────────────────────────────────────────────────────────────

/** Client → Server message types */
export type ClientEventType =
  | "chat:send"
  | "chat:stop"
  | "conversation:create"
  | "conversation:list"
  | "conversation:history"
  | "conversation:delete"
  | "ping";

/** Server → Client message types */
export type ServerEventType =
  | "chat:token"
  | "chat:message_complete"
  | "chat:error"
  | "conversation:created"
  | "conversation:listed"
  | "conversation:history_loaded"
  | "conversation:deleted"
  | "session:established"
  | "pong"
  | "error";

export interface WsClientMessage {
  type: ClientEventType;
  /** Client-generated correlation id so replies can be matched */
  requestId?: string;
  payload: Record<string, unknown>;
}

export interface WsServerMessage {
  type: ServerEventType;
  requestId?: string;
  payload: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
//  AI provider types
// ─────────────────────────────────────────────────────────────

export interface AiStreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string, usage?: TokenUsage) => void;
  onError: (error: Error) => void;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

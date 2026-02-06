// ─────────────────────────────────────────────────────────────
//  WebSocket connection handler
//
//  Each browser tab opens ONE WebSocket. Messages follow a
//  simple JSON protocol:
//    { type, requestId?, payload }
//
//  The server streams AI tokens back as individual `chat:token`
//  frames, giving the "typing" effect.
// ─────────────────────────────────────────────────────────────

import type WebSocket from "ws";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Session, WsClientMessage, WsServerMessage, ChatMessage } from "../types";
import { ConversationRepo, MessageRepo } from "../db/repositories";
import { streamCompletion } from "../ai/provider";
import { checkRateLimit } from "../middleware/rateLimit";
import { logger } from "../utils/logger";
import { config } from "../config";

// ── Validation schemas ───────────────────────────────────────

const ClientMessageSchema = z.object({
  type: z.enum([
    "chat:send",
    "chat:stop",
    "conversation:create",
    "conversation:list",
    "conversation:history",
    "conversation:delete",
    "ping",
  ]),
  requestId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
});

// ── Per-connection state ─────────────────────────────────────

interface ConnectionState {
  session: Session;
  /** AbortControllers for in-flight AI streams (keyed by requestId) */
  activeStreams: Map<string, AbortController>;
}

// ── Helpers ──────────────────────────────────────────────────

function send(ws: WebSocket, msg: WsServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, message: string, requestId?: string): void {
  send(ws, { type: "error", requestId, payload: { message } });
}

// ── Main handler ─────────────────────────────────────────────

export function handleConnection(ws: WebSocket, session: Session): void {
  const state: ConnectionState = {
    session,
    activeStreams: new Map(),
  };

  logger.info("WS connected", { sessionId: session.id });

  // Tell the client which session they're on
  send(ws, {
    type: "session:established",
    payload: { sessionId: session.id },
  });

  // ── Heartbeat (server-side ping) ────────────────────────────
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) {
      logger.warn("WS heartbeat timeout, terminating", { sessionId: session.id });
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, config.ws.heartbeatIntervalMs);

  ws.on("pong", () => {
    alive = true;
  });

  // ── Message router ──────────────────────────────────────────
  ws.on("message", async (raw) => {
    let parsed: WsClientMessage;
    try {
      const json = JSON.parse(raw.toString());
      parsed = ClientMessageSchema.parse(json) as WsClientMessage;
    } catch {
      sendError(ws, "Invalid message format");
      return;
    }

    const { type, requestId, payload } = parsed;

    switch (type) {
      case "ping":
        send(ws, { type: "pong", requestId, payload: {} });
        break;

      case "conversation:create":
        handleConversationCreate(ws, state, requestId);
        break;

      case "conversation:list":
        handleConversationList(ws, state, requestId);
        break;

      case "conversation:history":
        handleConversationHistory(ws, state, requestId, payload);
        break;

      case "conversation:delete":
        handleConversationDelete(ws, state, requestId, payload);
        break;

      case "chat:send":
        await handleChatSend(ws, state, requestId, payload);
        break;

      case "chat:stop":
        handleChatStop(state, payload);
        break;

      default:
        sendError(ws, `Unknown event type: ${type}`, requestId);
    }
  });

  // ── Cleanup on close ────────────────────────────────────────
  ws.on("close", () => {
    clearInterval(heartbeat);
    // Abort all active streams
    for (const ac of state.activeStreams.values()) {
      ac.abort();
    }
    state.activeStreams.clear();
    logger.info("WS disconnected", { sessionId: session.id });
  });

  ws.on("error", (err) => {
    logger.error("WS error", { sessionId: session.id, error: err.message });
  });
}

// ── Event handlers ───────────────────────────────────────────

function handleConversationCreate(
  ws: WebSocket,
  state: ConnectionState,
  requestId?: string
): void {
  const conv = ConversationRepo.create(state.session.id);
  send(ws, {
    type: "conversation:created",
    requestId,
    payload: { conversation: conv },
  });
}

function handleConversationList(
  ws: WebSocket,
  state: ConnectionState,
  requestId?: string
): void {
  const conversations = ConversationRepo.listBySession(state.session.id);
  send(ws, {
    type: "conversation:listed",
    requestId,
    payload: { conversations },
  });
}

function handleConversationHistory(
  ws: WebSocket,
  _state: ConnectionState,
  requestId?: string,
  payload?: Record<string, unknown>
): void {
  const conversationId = payload?.conversationId as string | undefined;
  if (!conversationId) {
    sendError(ws, "conversationId is required", requestId);
    return;
  }

  const messages = MessageRepo.listByConversation(conversationId);
  send(ws, {
    type: "conversation:history_loaded",
    requestId,
    payload: { conversationId, messages },
  });
}

function handleConversationDelete(
  ws: WebSocket,
  _state: ConnectionState,
  requestId?: string,
  payload?: Record<string, unknown>
): void {
  const conversationId = payload?.conversationId as string | undefined;
  if (!conversationId) {
    sendError(ws, "conversationId is required", requestId);
    return;
  }

  ConversationRepo.delete(conversationId);
  send(ws, {
    type: "conversation:deleted",
    requestId,
    payload: { conversationId },
  });
}

async function handleChatSend(
  ws: WebSocket,
  state: ConnectionState,
  requestId?: string,
  payload?: Record<string, unknown>
): Promise<void> {
  const conversationId = payload?.conversationId as string | undefined;
  const content = payload?.content as string | undefined;

  if (!conversationId || !content?.trim()) {
    sendError(ws, "conversationId and content are required", requestId);
    return;
  }

  // Rate limit check
  const allowed = await checkRateLimit(state.session.id);
  if (!allowed) {
    sendError(ws, "Rate limit exceeded. Please slow down.", requestId);
    return;
  }

  // Persist the user message
  MessageRepo.create(conversationId, "user", content.trim());

  // Load full history for context
  const history: ChatMessage[] = MessageRepo.listByConversation(conversationId);

  // Auto-title: if this is the first user message, set the title
  const userMessages = history.filter((m) => m.role === "user");
  if (userMessages.length === 1) {
    const title = content.trim().slice(0, 80) + (content.trim().length > 80 ? "..." : "");
    ConversationRepo.updateTitle(conversationId, title);
  }

  // Set up abort controller so the client can cancel
  const streamId = requestId ?? nanoid();
  const abortController = new AbortController();
  state.activeStreams.set(streamId, abortController);

  // Stream AI response
  await streamCompletion(history, {
    onToken(token) {
      send(ws, {
        type: "chat:token",
        requestId,
        payload: { conversationId, token },
      });
    },
    onComplete(fullText, usage) {
      // Persist the assistant message
      const assistantMsg = MessageRepo.create(conversationId, "assistant", fullText, {
        ...(usage ?? {}),
        model: "configured-model",
      });

      send(ws, {
        type: "chat:message_complete",
        requestId,
        payload: {
          conversationId,
          message: assistantMsg,
          usage: usage ?? null,
        },
      });

      state.activeStreams.delete(streamId);
    },
    onError(error) {
      send(ws, {
        type: "chat:error",
        requestId,
        payload: {
          conversationId,
          message: error.message || "An error occurred while generating a response.",
        },
      });
      state.activeStreams.delete(streamId);
    },
  }, {
    systemPrompt: "You are a helpful assistant. Be concise and informative.",
    signal: abortController.signal,
  });
}

function handleChatStop(
  state: ConnectionState,
  payload?: Record<string, unknown>
): void {
  const streamId = payload?.requestId as string | undefined;
  if (streamId && state.activeStreams.has(streamId)) {
    state.activeStreams.get(streamId)!.abort();
    state.activeStreams.delete(streamId);
    logger.info("Stream cancelled by client", { streamId });
  }
}

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../../core/config';
import { logger } from '../../core/logger';
import { collaborationService } from '../../services/collaboration';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  sessionId?: string;
  isAlive?: boolean;
}

export class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, Set<AuthenticatedWebSocket>>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      this.handleConnection(ws, req);
    });

    this.startHeartbeat();
    logger.info('WebSocket server initialized');
  }

  private handleConnection(ws: AuthenticatedWebSocket, req: any): void {
    ws.isAlive = true;

    // Authenticate via query param token
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as any;
      ws.userId = decoded.userId;
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    logger.info(`WebSocket client connected`, { userId: ws.userId });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        ws.send(JSON.stringify({ event: 'error', payload: { message: 'Invalid message format' } }));
      }
    });

    ws.on('close', () => {
      if (ws.sessionId) {
        collaborationService.leaveSession(ws.sessionId, ws.userId!);
        this.broadcastToSession(ws.sessionId, {
          event: 'user_left',
          payload: { userId: ws.userId },
          timestamp: Date.now(),
        }, ws.userId);
      }

      // Remove from clients
      for (const [, clients] of this.clients) {
        clients.delete(ws);
      }
      logger.info(`WebSocket client disconnected`, { userId: ws.userId });
    });
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: any): void {
    switch (message.event) {
      case 'join_session':
        this.handleJoinSession(ws, message.payload);
        break;
      case 'leave_session':
        this.handleLeaveSession(ws);
        break;
      case 'cursor_move':
        this.handleCursorMove(ws, message.payload);
        break;
      case 'file_change':
        this.handleFileChange(ws, message.payload);
        break;
      default:
        ws.send(JSON.stringify({ event: 'error', payload: { message: `Unknown event: ${message.event}` } }));
    }
  }

  private handleJoinSession(ws: AuthenticatedWebSocket, payload: any): void {
    const { sessionId, projectId, userName } = payload;

    if (projectId) {
      const session = collaborationService.createSession(projectId, ws.userId!, userName || 'Anonymous');
      ws.sessionId = session.id;
    } else if (sessionId) {
      collaborationService.joinSession(sessionId, ws.userId!, payload.userName || 'Anonymous');
      ws.sessionId = sessionId;
    }

    if (ws.sessionId) {
      if (!this.clients.has(ws.sessionId)) {
        this.clients.set(ws.sessionId, new Set());
      }
      this.clients.get(ws.sessionId)!.add(ws);

      ws.send(JSON.stringify({
        event: 'session_joined',
        payload: { sessionId: ws.sessionId },
        timestamp: Date.now(),
      }));

      this.broadcastToSession(ws.sessionId, {
        event: 'user_joined',
        payload: { userId: ws.userId, userName: payload.userName },
        timestamp: Date.now(),
      }, ws.userId);
    }
  }

  private handleLeaveSession(ws: AuthenticatedWebSocket): void {
    if (ws.sessionId) {
      collaborationService.leaveSession(ws.sessionId, ws.userId!);
      this.clients.get(ws.sessionId)?.delete(ws);
      ws.sessionId = undefined;
    }
  }

  private handleCursorMove(ws: AuthenticatedWebSocket, payload: any): void {
    if (!ws.sessionId) return;
    collaborationService.updateCursor(ws.sessionId, ws.userId!, payload.cursor);
    this.broadcastToSession(ws.sessionId, {
      event: 'cursor_move',
      payload: { userId: ws.userId, cursor: payload.cursor },
      timestamp: Date.now(),
    }, ws.userId);
  }

  private handleFileChange(ws: AuthenticatedWebSocket, payload: any): void {
    if (!ws.sessionId) return;
    this.broadcastToSession(ws.sessionId, {
      event: 'file_change',
      payload: { userId: ws.userId, ...payload },
      timestamp: Date.now(),
    }, ws.userId);
  }

  broadcastToSession(sessionId: string, message: any, excludeUserId?: string): void {
    const clients = this.clients.get(sessionId);
    if (!clients) return;

    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN && client.userId !== excludeUserId) {
        client.send(data);
      }
    }
  }

  sendToUser(userId: string, message: any): void {
    for (const [, clients] of this.clients) {
      for (const client of clients) {
        if (client.userId === userId && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocket) => {
        const authWs = ws as AuthenticatedWebSocket;
        if (!authWs.isAlive) {
          return authWs.terminate();
        }
        authWs.isAlive = false;
        authWs.ping();
      });
    }, config.WS_HEARTBEAT_INTERVAL);
  }

  shutdown(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss?.close();
  }

  getStats() {
    return {
      totalConnections: this.wss?.clients.size || 0,
      activeSessions: this.clients.size,
    };
  }
}

export const wsManager = new WebSocketManager();

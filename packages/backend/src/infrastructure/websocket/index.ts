import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { config } from '../../core/config';
import { logger } from '../../core/logger';
import { eventBus } from '../../core/events';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userName?: string;
}

export class WebSocketManager {
  private io: Server;

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: { origin: config.CORS_ORIGINS?.split(',') || ['http://localhost:3000'], credentials: true },
      transports: ['websocket', 'polling'],
      pingInterval: 25000,
      pingTimeout: 20000,
    });

    this.setupRedisAdapter();
    this.setupAuthentication();
    this.setupEventHandlers();
    this.setupEventBusForwarding();
  }

  private async setupRedisAdapter(): Promise<void> {
    try {
      const pubClient = new Redis(config.REDIS_URL);
      const subClient = pubClient.duplicate();

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          pubClient.on('ready', resolve);
          pubClient.on('error', reject);
        }),
        new Promise<void>((resolve, reject) => {
          subClient.on('ready', resolve);
          subClient.on('error', reject);
        }),
      ]);

      this.io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.IO Redis adapter connected');
    } catch (err) {
      logger.warn('Socket.IO Redis adapter failed, using in-memory', { error: (err as Error).message });
    }
  }

  private setupAuthentication(): void {
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));

      try {
        const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string; name: string };
        socket.userId = decoded.userId;
        socket.userName = decoded.name;
        next();
      } catch (err) {
        next(new Error('Invalid token'));
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      logger.info('Client connected', { socketId: socket.id, userId: socket.userId });

      // Join project room
      socket.on('join-project', async (projectId: string) => {
        await socket.join(`project:${projectId}`);
        // Broadcast presence to room
        this.io.to(`project:${projectId}`).emit('user-joined', {
          userId: socket.userId,
          userName: socket.userName,
          socketId: socket.id,
          timestamp: new Date(),
        });
        logger.info('User joined project room', { userId: socket.userId, projectId });
      });

      // Leave project room
      socket.on('leave-project', async (projectId: string) => {
        await socket.leave(`project:${projectId}`);
        this.io.to(`project:${projectId}`).emit('user-left', {
          userId: socket.userId,
          timestamp: new Date(),
        });
      });

      // File change broadcast (operational transform-ready)
      socket.on('file-change', (data: { projectId: string; path: string; content: string; cursorPosition?: any }) => {
        socket.to(`project:${data.projectId}`).emit('file-changed', {
          ...data,
          userId: socket.userId,
          userName: socket.userName,
          timestamp: new Date(),
        });
      });

      // Cursor position broadcast
      socket.on('cursor-move', (data: { projectId: string; path: string; position: { line: number; column: number } }) => {
        socket.to(`project:${data.projectId}`).emit('cursor-moved', {
          ...data,
          userId: socket.userId,
          userName: socket.userName,
        });
      });

      // Chat message in project
      socket.on('chat-message', (data: { projectId: string; content: string }) => {
        this.io.to(`project:${data.projectId}`).emit('chat-message', {
          id: `msg_${Date.now()}_${socket.id}`,
          content: data.content,
          userId: socket.userId,
          userName: socket.userName,
          timestamp: new Date(),
        });
      });

      // Disconnect
      socket.on('disconnect', (reason) => {
        logger.info('Client disconnected', { socketId: socket.id, userId: socket.userId, reason });
        // Notify all rooms this socket was in
        socket.rooms.forEach((room) => {
          if (room.startsWith('project:')) {
            this.io.to(room).emit('user-left', { userId: socket.userId, timestamp: new Date() });
          }
        });
      });
    });
  }

  // Forward relevant event bus events to WebSocket clients
  private setupEventBusForwarding(): void {
    eventBus.subscribe('generation.started', (event) => {
      this.io.to(`project:${event.payload.projectId}`).emit('generation-started', event.payload);
    });

    eventBus.subscribe('generation.completed', (event) => {
      this.io.to(`project:${event.payload.projectId}`).emit('generation-completed', event.payload);
    });

    eventBus.subscribe('generation.failed', (event) => {
      this.io.to(`project:${event.payload.projectId}`).emit('generation-failed', event.payload);
    });

    eventBus.subscribe('deployment.completed', (event) => {
      this.io.to(`project:${event.payload.projectId}`).emit('deployment-completed', event.payload);
    });

    eventBus.subscribe('deployment.failed', (event) => {
      this.io.to(`project:${event.payload.projectId}`).emit('deployment-failed', event.payload);
    });

    eventBus.subscribe('sandbox.ready', (event) => {
      this.io.to(`project:${event.payload.projectId}`).emit('sandbox-ready', event.payload);
    });
  }

  // Emit to specific project room
  emitToProject(projectId: string, event: string, data: any): void {
    this.io.to(`project:${projectId}`).emit(event, data);
  }

  // Emit to specific user
  emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  getIO(): Server {
    return this.io;
  }
}

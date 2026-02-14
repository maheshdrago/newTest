import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';
import { NotFoundError } from '../../core/errors';

interface Session {
  id: string;
  projectId: string;
  participants: Map<string, {
    userId: string;
    name: string;
    role: string;
    cursor?: { fileId: string; line: number; column: number };
    isOnline: boolean;
    joinedAt: Date;
  }>;
  createdAt: Date;
}

export class CollaborationService {
  private sessions = new Map<string, Session>();

  createSession(projectId: string): Session {
    const session: Session = {
      id: `ses_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`,
      projectId,
      participants: new Map(),
      createdAt: new Date(),
    };
    this.sessions.set(session.id, session);
    logger.info('Collaboration session created', { sessionId: session.id, projectId });
    return session;
  }

  joinSession(sessionId: string, userId: string, name: string, role: string = 'editor') {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError('Session', sessionId);
    }

    session.participants.set(userId, {
      userId,
      name,
      role,
      isOnline: true,
      joinedAt: new Date(),
    });

    eventBus.publish({
      type: EventTypes.COLLABORATOR_JOINED,
      payload: { sessionId, userId, name },
      timestamp: new Date(),
    });

    return session;
  }

  leaveSession(sessionId: string, userId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (participant) {
      participant.isOnline = false;
      eventBus.publish({
        type: EventTypes.COLLABORATOR_LEFT,
        payload: { sessionId, userId },
        timestamp: new Date(),
      });
    }
  }

  updateCursor(sessionId: string, userId: string, cursor: { fileId: string; line: number; column: number }) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (participant) {
      participant.cursor = cursor;
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByProject(projectId: string): Session | undefined {
    return Array.from(this.sessions.values()).find(s => s.projectId === projectId);
  }
}

export const collaborationService = new CollaborationService();

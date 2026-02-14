import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';

interface Session {
  id: string;
  projectId: string;
  participants: Map<string, { userId: string; name: string; role: string; cursor?: { fileId: string; line: number; column: number }; joinedAt: Date }>;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

export class CollaborationService {
  createSession(projectId: string, userId: string, userName: string): Session {
    const existing = Array.from(sessions.values()).find(s => s.projectId === projectId);
    if (existing) {
      this.joinSession(existing.id, userId, userName);
      return existing;
    }

    const session: Session = {
      id: `session_${Date.now().toString(36)}`,
      projectId,
      participants: new Map(),
      createdAt: new Date(),
    };

    session.participants.set(userId, {
      userId,
      name: userName,
      role: 'owner',
      joinedAt: new Date(),
    });

    sessions.set(session.id, session);

    eventBus.publish({
      type: EventTypes.COLLABORATION_SESSION_STARTED,
      payload: { sessionId: session.id, projectId, userId },
      timestamp: new Date(),
    });

    return session;
  }

  joinSession(sessionId: string, userId: string, userName: string): void {
    const session = sessions.get(sessionId);
    if (!session) return;

    session.participants.set(userId, {
      userId,
      name: userName,
      role: 'editor',
      joinedAt: new Date(),
    });

    eventBus.publish({
      type: EventTypes.COLLABORATION_USER_JOINED,
      payload: { sessionId, userId },
      timestamp: new Date(),
    });
  }

  leaveSession(sessionId: string, userId: string): void {
    const session = sessions.get(sessionId);
    if (!session) return;

    session.participants.delete(userId);

    if (session.participants.size === 0) {
      sessions.delete(sessionId);
    }

    eventBus.publish({
      type: EventTypes.COLLABORATION_USER_LEFT,
      payload: { sessionId, userId },
      timestamp: new Date(),
    });
  }

  updateCursor(sessionId: string, userId: string, cursor: { fileId: string; line: number; column: number }): void {
    const session = sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.get(userId);
    if (participant) {
      participant.cursor = cursor;
    }
  }

  getSession(sessionId: string) {
    return sessions.get(sessionId);
  }

  getSessionByProject(projectId: string) {
    return Array.from(sessions.values()).find(s => s.projectId === projectId);
  }
}

export const collaborationService = new CollaborationService();

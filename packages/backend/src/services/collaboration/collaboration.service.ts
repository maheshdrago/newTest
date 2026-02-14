import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';
import { NotFoundError } from '../../core/errors';
import { getDatabase } from '../../infrastructure/database';

interface Participant {
  userId: string;
  name: string;
  role: string;
  cursor?: { fileId: string; line: number; column: number };
  joinedAt: string;
}

export class CollaborationService {
  private db = getDatabase();

  async createOrJoinSession(projectId: string, userId: string, userName: string): Promise<any> {
    // Check for existing active session
    const existing = await this.db('collaboration_sessions')
      .where({ project_id: projectId, is_active: true })
      .first();

    if (existing) {
      await this.addParticipant(existing.id, userId, userName);
      return this.getSession(existing.id);
    }

    // Create new session
    const participants: Participant[] = [{
      userId,
      name: userName,
      role: 'owner',
      joinedAt: new Date().toISOString(),
    }];

    const [session] = await this.db('collaboration_sessions')
      .insert({
        project_id: projectId,
        participants: JSON.stringify(participants),
        is_active: true,
      })
      .returning('*');

    eventBus.publish({
      type: EventTypes.COLLABORATION_SESSION_STARTED,
      payload: { sessionId: session.id, projectId, userId },
      timestamp: new Date(),
    });

    logger.info('Collaboration session created', { sessionId: session.id, projectId });
    return session;
  }

  async addParticipant(sessionId: string, userId: string, userName: string): Promise<void> {
    const session = await this.db('collaboration_sessions').where('id', sessionId).first();
    if (!session) throw new NotFoundError('Session', sessionId);

    const participants: Participant[] = JSON.parse(session.participants || '[]');

    // Don't add duplicate
    if (participants.some((p) => p.userId === userId)) return;

    participants.push({
      userId,
      name: userName,
      role: 'editor',
      joinedAt: new Date().toISOString(),
    });

    await this.db('collaboration_sessions')
      .where('id', sessionId)
      .update({ participants: JSON.stringify(participants), updated_at: new Date() });

    eventBus.publish({
      type: EventTypes.COLLABORATION_USER_JOINED,
      payload: { sessionId, userId },
      timestamp: new Date(),
    });
  }

  async removeParticipant(sessionId: string, userId: string): Promise<void> {
    const session = await this.db('collaboration_sessions').where('id', sessionId).first();
    if (!session) return;

    const participants: Participant[] = JSON.parse(session.participants || '[]');
    const filtered = participants.filter((p) => p.userId !== userId);

    if (filtered.length === 0) {
      // No participants left — deactivate session
      await this.db('collaboration_sessions')
        .where('id', sessionId)
        .update({ is_active: false, participants: '[]', updated_at: new Date() });
    } else {
      await this.db('collaboration_sessions')
        .where('id', sessionId)
        .update({ participants: JSON.stringify(filtered), updated_at: new Date() });
    }

    eventBus.publish({
      type: EventTypes.COLLABORATION_USER_LEFT,
      payload: { sessionId, userId },
      timestamp: new Date(),
    });
  }

  async updateCursor(sessionId: string, userId: string, cursor: { fileId: string; line: number; column: number }): Promise<void> {
    const session = await this.db('collaboration_sessions').where('id', sessionId).first();
    if (!session) return;

    const participants: Participant[] = JSON.parse(session.participants || '[]');
    const participant = participants.find((p) => p.userId === userId);
    if (participant) {
      participant.cursor = cursor;
      await this.db('collaboration_sessions')
        .where('id', sessionId)
        .update({ participants: JSON.stringify(participants), updated_at: new Date() });
    }
  }

  async getSession(sessionId: string) {
    return this.db('collaboration_sessions').where('id', sessionId).first();
  }

  async getSessionByProject(projectId: string) {
    return this.db('collaboration_sessions')
      .where({ project_id: projectId, is_active: true })
      .first();
  }

  async cleanupInactiveSessions(): Promise<number> {
    // Deactivate sessions with no activity for 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.db('collaboration_sessions')
      .where('is_active', true)
      .where('updated_at', '<', cutoff)
      .update({ is_active: false, updated_at: new Date() });
  }
}

export const collaborationService = new CollaborationService();

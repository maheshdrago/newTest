import crypto from 'crypto';
import { BaseRepository } from './base.repository';

export interface UserSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  device_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  last_active_at: Date;
  expires_at: Date;
  is_revoked: boolean;
  created_at: Date;
  updated_at: Date;
}

export class SessionRepository extends BaseRepository<UserSessionRow> {
  protected tableName = 'user_sessions';

  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createSession(data: {
    userId: string;
    refreshToken: string;
    expiresAt: Date;
    deviceName?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<UserSessionRow> {
    return this.create({
      user_id: data.userId,
      token_hash: SessionRepository.hashToken(data.refreshToken),
      device_name: data.deviceName || null,
      ip_address: data.ipAddress || null,
      user_agent: data.userAgent || null,
      expires_at: data.expiresAt,
      is_revoked: false,
    });
  }

  async findByToken(refreshToken: string): Promise<UserSessionRow | null> {
    const hash = SessionRepository.hashToken(refreshToken);
    const session = await this.db(this.tableName)
      .where({ token_hash: hash, is_revoked: false })
      .where('expires_at', '>', new Date())
      .first();
    return session || null;
  }

  async revokeSession(refreshToken: string): Promise<void> {
    const hash = SessionRepository.hashToken(refreshToken);
    await this.db(this.tableName)
      .where('token_hash', hash)
      .update({ is_revoked: true, updated_at: new Date() });
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    return this.db(this.tableName)
      .where({ user_id: userId, is_revoked: false })
      .update({ is_revoked: true, updated_at: new Date() });
  }

  async revokeSessionById(sessionId: string, userId: string): Promise<boolean> {
    const count = await this.db(this.tableName)
      .where({ id: sessionId, user_id: userId })
      .update({ is_revoked: true, updated_at: new Date() });
    return count > 0;
  }

  async getActiveSessions(userId: string): Promise<UserSessionRow[]> {
    return this.db(this.tableName)
      .where({ user_id: userId, is_revoked: false })
      .where('expires_at', '>', new Date())
      .orderBy('last_active_at', 'desc');
  }

  async touchSession(refreshToken: string): Promise<void> {
    const hash = SessionRepository.hashToken(refreshToken);
    await this.db(this.tableName)
      .where('token_hash', hash)
      .update({ last_active_at: new Date(), updated_at: new Date() });
  }

  async cleanupExpired(): Promise<number> {
    return this.db(this.tableName)
      .where('expires_at', '<', new Date())
      .orWhere('is_revoked', true)
      .where('updated_at', '<', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // 7 days old
      .delete();
  }
}

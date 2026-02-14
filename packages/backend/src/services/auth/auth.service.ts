import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../../core/config';
import { UnauthorizedError, ConflictError } from '../../core/errors';
import { eventBus, EventTypes } from '../../core/events';
import { logger } from '../../core/logger';
import { UserRepository, AuditRepository, SessionRepository } from '../../infrastructure/database';

const userRepo = new UserRepository();
const auditRepo = new AuditRepository();
const sessionRepo = new SessionRepository();

export class AuthService {
  async register(name: string, email: string, password: string, meta?: { ip?: string; userAgent?: string }) {
    const existing = await userRepo.findByEmail(email);
    if (existing) {
      throw new ConflictError('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await userRepo.create({
      name,
      email,
      password_hash: passwordHash,
      role: 'member',
      plan: 'free',
      preferences: {},
    });

    eventBus.publish({
      type: EventTypes.USER_REGISTERED,
      payload: { userId: user.id, email: user.email },
      timestamp: new Date(),
    });

    await auditRepo.log({
      user_id: user.id,
      action: 'user.registered',
      resource_type: 'user',
      resource_id: user.id,
      details: { email },
      ip_address: meta?.ip || null,
      user_agent: meta?.userAgent || null,
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    const tokens = await this.createSession(user, meta);
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan },
      tokens,
    };
  }

  async login(email: string, password: string, meta?: { ip?: string; userAgent?: string }) {
    const user = await userRepo.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    await userRepo.updateLastLogin(user.id);

    eventBus.publish({
      type: EventTypes.USER_LOGGED_IN,
      payload: { userId: user.id },
      timestamp: new Date(),
    });

    await auditRepo.log({
      user_id: user.id,
      action: 'user.login',
      resource_type: 'user',
      resource_id: user.id,
      details: {},
      ip_address: meta?.ip || null,
      user_agent: meta?.userAgent || null,
    });

    const tokens = await this.createSession(user, meta);
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan },
      tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    // Validate the refresh token exists in the session store and is not revoked
    const session = await sessionRepo.findByToken(refreshToken);
    if (!session) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Verify JWT signature
    let payload: any;
    try {
      payload = jwt.verify(refreshToken, config.JWT_SECRET);
    } catch {
      // Token is cryptographically invalid — revoke the session
      await sessionRepo.revokeSession(refreshToken);
      throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await userRepo.findById(payload.userId);
    if (!user) {
      await sessionRepo.revokeSession(refreshToken);
      throw new UnauthorizedError('User not found');
    }

    // Rotate: revoke old token, create new session
    await sessionRepo.revokeSession(refreshToken);
    const tokens = await this.createSession(user, {
      ip: session.ip_address || undefined,
      userAgent: session.user_agent || undefined,
    });

    return tokens;
  }

  /**
   * Logout — revokes the specific refresh token session
   */
  async logout(refreshToken: string): Promise<void> {
    await sessionRepo.revokeSession(refreshToken);
    logger.info('User session revoked');
  }

  /**
   * Logout from all devices — revokes all sessions for a user
   */
  async logoutAll(userId: string): Promise<number> {
    const count = await sessionRepo.revokeAllUserSessions(userId);
    logger.info('All user sessions revoked', { userId, count });
    return count;
  }

  /**
   * List active sessions for the current user (device management)
   */
  async getActiveSessions(userId: string) {
    const sessions = await sessionRepo.getActiveSessions(userId);
    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.device_name,
      ipAddress: s.ip_address,
      lastActiveAt: s.last_active_at,
      createdAt: s.created_at,
    }));
  }

  /**
   * Revoke a specific session by ID (e.g., "log out this device")
   */
  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    return sessionRepo.revokeSessionById(sessionId, userId);
  }

  private async createSession(
    user: { id: string; email: string; role: string; name: string },
    meta?: { ip?: string; userAgent?: string; deviceName?: string },
  ) {
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, name: user.name },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN },
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      config.JWT_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN },
    );

    // Parse expiry from JWT_REFRESH_EXPIRES_IN (e.g., "30d" → 30 days)
    const expiresAt = new Date();
    const match = config.JWT_REFRESH_EXPIRES_IN.match(/^(\d+)([dhms])$/);
    if (match) {
      const val = parseInt(match[1], 10);
      const unit = match[2];
      if (unit === 'd') expiresAt.setDate(expiresAt.getDate() + val);
      else if (unit === 'h') expiresAt.setHours(expiresAt.getHours() + val);
      else if (unit === 'm') expiresAt.setMinutes(expiresAt.getMinutes() + val);
      else if (unit === 's') expiresAt.setSeconds(expiresAt.getSeconds() + val);
    } else {
      expiresAt.setDate(expiresAt.getDate() + 30); // fallback 30 days
    }

    // Persist session to DB
    await sessionRepo.createSession({
      userId: user.id,
      refreshToken,
      expiresAt,
      deviceName: meta?.deviceName,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return { accessToken, refreshToken, expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000) };
  }
}

export const authService = new AuthService();

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../../core/config';
import { UnauthorizedError, ConflictError, ValidationError } from '../../core/errors';
import { eventBus, EventTypes } from '../../core/events';
import { logger } from '../../core/logger';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory store for demo - replace with database repository
const users = new Map<string, UserRecord>();

export class AuthService {
  async register(name: string, email: string, password: string) {
    const existing = Array.from(users.values()).find(u => u.email === email);
    if (existing) {
      throw new ConflictError('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user: UserRecord = {
      id: `usr_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`,
      name,
      email,
      passwordHash,
      role: 'user',
      plan: 'free',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    users.set(user.id, user);

    eventBus.publish({
      type: EventTypes.USER_REGISTERED,
      payload: { userId: user.id, email: user.email },
      timestamp: new Date(),
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    const tokens = this.generateTokens(user);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        projectCount: 0,
        lastActiveAt: new Date(),
      },
      tokens,
    };
  }

  async login(email: string, password: string) {
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    eventBus.publish({
      type: EventTypes.USER_LOGGED_IN,
      payload: { userId: user.id },
      timestamp: new Date(),
    });

    const tokens = this.generateTokens(user);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        projectCount: 0,
        lastActiveAt: new Date(),
      },
      tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = jwt.verify(refreshToken, config.jwt.secret) as any;
      const user = users.get(payload.userId);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  private generateTokens(user: UserRecord) {
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn },
    );
    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      config.jwt.secret,
      { expiresIn: config.jwt.refreshExpiresIn },
    );
    return { accessToken, refreshToken, expiresIn: 604800 };
  }
}

export const authService = new AuthService();

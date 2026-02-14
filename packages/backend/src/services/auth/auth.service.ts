import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../../core/config';
import { UnauthorizedError, ConflictError } from '../../core/errors';
import { eventBus, EventTypes } from '../../core/events';
import { logger } from '../../core/logger';
import { UserRepository } from '../../infrastructure/database';
import { AuditRepository } from '../../infrastructure/database';

const userRepo = new UserRepository();
const auditRepo = new AuditRepository();

export class AuthService {
  async register(name: string, email: string, password: string) {
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
      ip_address: null,
      user_agent: null,
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
      },
      tokens,
    };
  }

  async login(email: string, password: string) {
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
      ip_address: null,
      user_agent: null,
    });

    const tokens = this.generateTokens(user);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
      },
      tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = jwt.verify(refreshToken, config.JWT_SECRET) as any;
      const user = await userRepo.findById(payload.userId);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  private generateTokens(user: { id: string; email: string; role: string; name: string }) {
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
    return { accessToken, refreshToken, expiresIn: 604800 };
  }
}

export const authService = new AuthService();

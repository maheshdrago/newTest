import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../core/config';
import { AuthenticationError, ConflictError, ValidationError } from '../../core/errors';
import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';

// In-memory store for demo (replace with database in production)
const users = new Map<string, { id: string; name: string; email: string; password: string; role: string; plan: string; createdAt: Date }>();

export class AuthService {
  async register(name: string, email: string, password: string) {
    // Check if user exists
    const existing = Array.from(users.values()).find(u => u.email === email);
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const id = `usr_${Date.now().toString(36)}`;
    const user = {
      id,
      name,
      email,
      password: hashedPassword,
      role: 'user',
      plan: 'free',
      createdAt: new Date(),
    };

    users.set(id, user);
    logger.info(`User registered: ${email}`, { userId: id });

    eventBus.publish({
      type: EventTypes.USER_REGISTERED,
      payload: { userId: id, email },
      timestamp: new Date(),
    });

    const tokens = this.generateTokens(user);
    const { password: _, ...userWithoutPassword } = user;
    return { user: { ...userWithoutPassword, projectCount: 0, lastActiveAt: new Date() }, tokens };
  }

  async login(email: string, password: string) {
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    logger.info(`User logged in: ${email}`, { userId: user.id });

    eventBus.publish({
      type: EventTypes.USER_LOGGED_IN,
      payload: { userId: user.id },
      timestamp: new Date(),
    });

    const tokens = this.generateTokens(user);
    const { password: _, ...userWithoutPassword } = user;
    return { user: { ...userWithoutPassword, projectCount: 0, lastActiveAt: new Date() }, tokens };
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, config.JWT_SECRET) as any;
      const user = users.get(decoded.userId);
      if (!user) throw new AuthenticationError('User not found');
      return this.generateTokens(user);
    } catch {
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  async getUserById(userId: string) {
    const user = users.get(userId);
    if (!user) return null;
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private generateTokens(user: { id: string; email: string; role: string }) {
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      config.JWT_SECRET,
      { expiresIn: config.JWT_REFRESH_EXPIRES_IN }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    };
  }
}

export const authService = new AuthService();

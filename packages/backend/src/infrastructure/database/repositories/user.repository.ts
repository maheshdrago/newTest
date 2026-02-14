import { BaseRepository } from './base.repository';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_url: string | null;
  role: 'admin' | 'member' | 'viewer';
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  preferences: Record<string, any>;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class UserRepository extends BaseRepository<UserRow> {
  protected tableName = 'users';

  async findByEmail(email: string): Promise<UserRow | null> {
    return this.db(this.tableName).where('email', email).first() || null;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db(this.tableName).where('id', id).update({ last_login_at: new Date() });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.db(this.tableName).where('id', id).update({ password_hash: passwordHash, updated_at: new Date() });
  }
}

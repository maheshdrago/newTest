import { Knex } from 'knex';
import { getDatabase } from '../connection';

export abstract class BaseRepository<T> {
  protected db: Knex;
  protected abstract tableName: string;

  constructor() {
    this.db = getDatabase();
  }

  async findById(id: string): Promise<T | null> {
    const row = await this.db(this.tableName).where('id', id).first();
    return row || null;
  }

  async findAll(filters: Partial<T> = {}, limit = 50, offset = 0): Promise<T[]> {
    let query = this.db(this.tableName).where(filters as any);
    return query.limit(limit).offset(offset).orderBy('created_at', 'desc');
  }

  async create(data: Partial<T>): Promise<T> {
    const [row] = await this.db(this.tableName).insert(data as any).returning('*');
    return row;
  }

  async update(id: string, data: Partial<T>): Promise<T | null> {
    const [row] = await this.db(this.tableName).where('id', id).update({ ...data as any, updated_at: new Date() }).returning('*');
    return row || null;
  }

  async delete(id: string): Promise<boolean> {
    const count = await this.db(this.tableName).where('id', id).delete();
    return count > 0;
  }

  async count(filters: Partial<T> = {}): Promise<number> {
    const [{ count }] = await this.db(this.tableName).where(filters as any).count('* as count');
    return Number(count);
  }

  async transaction<R>(fn: (trx: Knex.Transaction) => Promise<R>): Promise<R> {
    return this.db.transaction(fn);
  }
}

import { BaseRepository } from './base.repository';

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export class AuditRepository extends BaseRepository<AuditLogRow> {
  protected tableName = 'audit_logs';

  async log(entry: Omit<AuditLogRow, 'id' | 'created_at'>): Promise<void> {
    await this.db(this.tableName).insert({ ...entry, details: JSON.stringify(entry.details) });
  }

  async findByUser(userId: string, limit = 50): Promise<AuditLogRow[]> {
    return this.db(this.tableName).where('user_id', userId).orderBy('created_at', 'desc').limit(limit);
  }

  async findByResource(resourceType: string, resourceId: string, limit = 50): Promise<AuditLogRow[]> {
    return this.db(this.tableName).where({ resource_type: resourceType, resource_id: resourceId }).orderBy('created_at', 'desc').limit(limit);
  }
}

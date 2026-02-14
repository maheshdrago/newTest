import { BaseRepository } from './base.repository';

export interface ChatMessageRow {
  id: string;
  project_id: string;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  generation_job_id: string | null;
  file_changes: any[];
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export class ChatRepository extends BaseRepository<ChatMessageRow> {
  protected tableName = 'chat_messages';

  async getProjectMessages(projectId: string, limit = 100, offset = 0): Promise<ChatMessageRow[]> {
    return this.db(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'asc')
      .limit(limit)
      .offset(offset);
  }

  async addMessage(data: {
    projectId: string;
    userId?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    generationJobId?: string;
    fileChanges?: any[];
    metadata?: Record<string, any>;
  }): Promise<ChatMessageRow> {
    return this.create({
      project_id: data.projectId,
      user_id: data.userId || null,
      role: data.role,
      content: data.content,
      generation_job_id: data.generationJobId || null,
      file_changes: data.fileChanges || [],
      metadata: data.metadata || {},
    } as any);
  }

  async getMessageCount(projectId: string): Promise<number> {
    const [{ count }] = await this.db(this.tableName)
      .where('project_id', projectId)
      .count('* as count');
    return Number(count);
  }

  async deleteProjectMessages(projectId: string): Promise<number> {
    return this.db(this.tableName).where('project_id', projectId).delete();
  }
}

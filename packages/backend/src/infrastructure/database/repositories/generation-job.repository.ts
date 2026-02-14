import { BaseRepository } from './base.repository';

export interface GenerationJobRow {
  id: string;
  project_id: string;
  user_id: string;
  prompt: string;
  model: string | null;
  provider: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result: any;
  tokens_used: number;
  cost: number;
  duration_ms: number | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export class GenerationJobRepository extends BaseRepository<GenerationJobRow> {
  protected tableName = 'generation_jobs';

  async findByProject(projectId: string, limit = 20): Promise<GenerationJobRow[]> {
    return this.db(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  async findPending(limit = 10): Promise<GenerationJobRow[]> {
    return this.db(this.tableName)
      .where('status', 'queued')
      .orderBy('created_at', 'asc')
      .limit(limit);
  }

  async markProcessing(id: string): Promise<void> {
    await this.db(this.tableName).where('id', id).update({ status: 'processing', updated_at: new Date() });
  }

  async markCompleted(id: string, result: any, tokensUsed: number, cost: number, durationMs: number): Promise<void> {
    await this.db(this.tableName).where('id', id).update({
      status: 'completed', result: JSON.stringify(result), tokens_used: tokensUsed,
      cost, duration_ms: durationMs, updated_at: new Date(),
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.db(this.tableName).where('id', id).update({ status: 'failed', error_message: errorMessage, updated_at: new Date() });
  }

  async getUserUsageToday(userId: string): Promise<{ totalTokens: number; totalCost: number; jobCount: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [result] = await this.db(this.tableName)
      .where('user_id', userId)
      .where('created_at', '>=', today)
      .select(
        this.db.raw('COALESCE(SUM(tokens_used), 0) as "totalTokens"'),
        this.db.raw('COALESCE(SUM(cost), 0) as "totalCost"'),
        this.db.raw('COUNT(*) as "jobCount"')
      );
    return { totalTokens: Number(result.totalTokens), totalCost: Number(result.totalCost), jobCount: Number(result.jobCount) };
  }
}

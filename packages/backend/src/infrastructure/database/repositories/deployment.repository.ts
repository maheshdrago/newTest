import { BaseRepository } from './base.repository';

export interface DeploymentRow {
  id: string;
  project_id: string;
  version: number;
  status: 'queued' | 'building' | 'deploying' | 'live' | 'failed' | 'rolled_back';
  url: string | null;
  container_id: string | null;
  build_logs: string[];
  environment: Record<string, string>;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class DeploymentRepository extends BaseRepository<DeploymentRow> {
  protected tableName = 'deployments';

  async findByProject(projectId: string): Promise<DeploymentRow[]> {
    return this.db(this.tableName).where('project_id', projectId).orderBy('created_at', 'desc');
  }

  async findLive(projectId: string): Promise<DeploymentRow | null> {
    return this.db(this.tableName).where({ project_id: projectId, status: 'live' }).orderBy('created_at', 'desc').first() || null;
  }

  async appendLog(id: string, log: string): Promise<void> {
    await this.db.raw(
      `UPDATE deployments SET build_logs = build_logs || ?::jsonb, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify([log]), id]
    );
  }
}

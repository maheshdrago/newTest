import { Knex } from 'knex';
import { BaseRepository } from './base.repository';

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  framework: string;
  status: string;
  visibility: string;
  owner_id: string;
  current_version: number;
  settings: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectFileRow {
  id: string;
  project_id: string;
  path: string;
  content: string;
  language: string | null;
  checksum: string | null;
  size_bytes: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectSnapshotRow {
  id: string;
  project_id: string;
  version: number;
  label: string | null;
  description: string | null;
  created_by: string | null;
  file_manifest: Record<string, string>;
  created_at: Date;
}

export class ProjectRepository extends BaseRepository<ProjectRow> {
  protected tableName = 'projects';

  async findByOwner(ownerId: string, limit = 50, offset = 0): Promise<ProjectRow[]> {
    return this.db(this.tableName)
      .where('owner_id', ownerId)
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async findWithFiles(projectId: string): Promise<{ project: ProjectRow; files: ProjectFileRow[] } | null> {
    const project = await this.findById(projectId);
    if (!project) return null;
    const files = await this.db('project_files')
      .where({ project_id: projectId, version: project.current_version })
      .orderBy('path');
    return { project, files };
  }

  // File operations
  async getFiles(projectId: string, version?: number): Promise<ProjectFileRow[]> {
    const project = await this.findById(projectId);
    if (!project) return [];
    return this.db('project_files')
      .where({ project_id: projectId, version: version || project.current_version })
      .orderBy('path');
  }

  async upsertFile(projectId: string, path: string, content: string, language: string, version: number, trx?: Knex.Transaction): Promise<ProjectFileRow> {
    const db = trx || this.db;
    const existing = await db('project_files').where({ project_id: projectId, path, version }).first();
    const checksum = require('crypto').createHash('sha256').update(content).digest('hex');
    const data = { project_id: projectId, path, content, language, checksum, size_bytes: Buffer.byteLength(content), version };

    if (existing) {
      const [row] = await db('project_files').where('id', existing.id).update({ ...data, updated_at: new Date() }).returning('*');
      return row;
    } else {
      const [row] = await db('project_files').insert(data).returning('*');
      return row;
    }
  }

  async deleteFile(projectId: string, path: string, version: number): Promise<boolean> {
    const count = await this.db('project_files').where({ project_id: projectId, path, version }).delete();
    return count > 0;
  }

  // Snapshot operations
  async createSnapshot(projectId: string, userId: string, label?: string, description?: string): Promise<ProjectSnapshotRow> {
    return this.transaction(async (trx) => {
      const project = await trx('projects').where('id', projectId).first();
      if (!project) throw new Error('Project not found');

      const files = await trx('project_files').where({ project_id: projectId, version: project.current_version });
      const manifest: Record<string, string> = {};
      files.forEach((f: ProjectFileRow) => { manifest[f.path] = f.checksum || ''; });

      const newVersion = project.current_version + 1;

      // Copy current files to new version
      for (const file of files) {
        await trx('project_files').insert({
          project_id: projectId,
          path: file.path,
          content: file.content,
          language: file.language,
          checksum: file.checksum,
          size_bytes: file.size_bytes,
          version: newVersion,
        });
      }

      // Create snapshot record
      const [snapshot] = await trx('project_snapshots').insert({
        project_id: projectId,
        version: project.current_version,
        label: label || `v${project.current_version}`,
        description,
        created_by: userId,
        file_manifest: JSON.stringify(manifest),
      }).returning('*');

      // Update project version
      await trx('projects').where('id', projectId).update({ current_version: newVersion, updated_at: new Date() });

      return snapshot;
    });
  }

  async getSnapshots(projectId: string): Promise<ProjectSnapshotRow[]> {
    return this.db('project_snapshots').where('project_id', projectId).orderBy('version', 'desc');
  }

  async restoreSnapshot(projectId: string, version: number): Promise<void> {
    await this.update(projectId, { current_version: version } as any);
  }
}

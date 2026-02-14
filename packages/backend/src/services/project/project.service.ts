import { NotFoundError, ForbiddenError } from '../../core/errors';
import { eventBus, EventTypes } from '../../core/events';
import { logger } from '../../core/logger';

interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  status: string;
  framework: string;
  visibility: string;
  files: Array<{
    id: string;
    path: string;
    content: string;
    language: string;
    lastModifiedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  metadata: {
    totalFiles: number;
    totalSize: number;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    version: string;
  };
  createdAt: Date;
  updatedAt: Date;
  deployedAt?: Date;
  deploymentUrl?: string;
}

// In-memory store for demo
const projects = new Map<string, ProjectRecord>();

export class ProjectService {
  async create(
    ownerId: string,
    data: { name: string; description: string; framework: string; visibility?: string },
  ): Promise<ProjectRecord> {
    const project: ProjectRecord = {
      id: `prj_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`,
      name: data.name,
      description: data.description,
      ownerId,
      status: 'draft',
      framework: data.framework,
      visibility: data.visibility || 'private',
      files: [],
      metadata: {
        totalFiles: 0,
        totalSize: 0,
        dependencies: {},
        devDependencies: {},
        version: '0.1.0',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    projects.set(project.id, project);

    eventBus.publish({
      type: EventTypes.PROJECT_CREATED,
      payload: { projectId: project.id, ownerId },
      timestamp: new Date(),
    });

    logger.info('Project created', { projectId: project.id, ownerId });
    return project;
  }

  async getById(projectId: string, userId: string): Promise<ProjectRecord> {
    const project = projects.get(projectId);
    if (!project) {
      throw new NotFoundError('Project', projectId);
    }
    if (project.visibility === 'private' && project.ownerId !== userId) {
      throw new ForbiddenError('Access denied to this project');
    }
    return project;
  }

  async list(userId: string, params: { page: number; pageSize: number; sortBy: string; sortOrder: string }) {
    const userProjects = Array.from(projects.values())
      .filter(p => p.ownerId === userId || p.visibility === 'public');

    const sorted = userProjects.sort((a, b) => {
      const aVal = a[params.sortBy as keyof ProjectRecord] as any;
      const bVal = b[params.sortBy as keyof ProjectRecord] as any;
      return params.sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });

    const start = (params.page - 1) * params.pageSize;
    const paginated = sorted.slice(start, start + params.pageSize);

    return {
      projects: paginated,
      total: userProjects.length,
      page: params.page,
      pageSize: params.pageSize,
      hasMore: start + params.pageSize < userProjects.length,
    };
  }

  async update(projectId: string, userId: string, data: Partial<Pick<ProjectRecord, 'name' | 'description' | 'visibility'>>) {
    const project = await this.getById(projectId, userId);
    if (project.ownerId !== userId) {
      throw new ForbiddenError('Only the owner can update this project');
    }

    Object.assign(project, { ...data, updatedAt: new Date() });
    projects.set(projectId, project);

    eventBus.publish({
      type: EventTypes.PROJECT_UPDATED,
      payload: { projectId, changes: data },
      timestamp: new Date(),
    });

    return project;
  }

  async delete(projectId: string, userId: string): Promise<void> {
    const project = await this.getById(projectId, userId);
    if (project.ownerId !== userId) {
      throw new ForbiddenError('Only the owner can delete this project');
    }

    projects.delete(projectId);

    eventBus.publish({
      type: EventTypes.PROJECT_DELETED,
      payload: { projectId },
      timestamp: new Date(),
    });

    logger.info('Project deleted', { projectId });
  }

  async updateFiles(projectId: string, files: ProjectRecord['files']): Promise<ProjectRecord> {
    const project = projects.get(projectId);
    if (!project) {
      throw new NotFoundError('Project', projectId);
    }

    project.files = files;
    project.metadata.totalFiles = files.length;
    project.metadata.totalSize = files.reduce((sum, f) => sum + f.content.length, 0);
    project.updatedAt = new Date();
    projects.set(projectId, project);

    return project;
  }
}

export const projectService = new ProjectService();

import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, AuthorizationError, ValidationError } from '../../core/errors';
import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';

interface ProjectEntity {
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
const projects = new Map<string, ProjectEntity>();

export class ProjectService {
  async createProject(ownerId: string, data: { name: string; description: string; framework: string; visibility?: string }) {
    const id = uuidv4();
    const project: ProjectEntity = {
      id,
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

    projects.set(id, project);
    logger.info(`Project created: ${data.name}`, { projectId: id, ownerId });

    eventBus.publish({
      type: EventTypes.PROJECT_CREATED,
      payload: { projectId: id, ownerId, framework: data.framework },
      timestamp: new Date(),
    });

    return project;
  }

  async getProject(projectId: string, userId: string): Promise<ProjectEntity> {
    const project = projects.get(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    
    if (project.visibility === 'private' && project.ownerId !== userId) {
      throw new AuthorizationError('You do not have access to this project');
    }

    return project;
  }

  async listProjects(userId: string, params: {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: string;
    search?: string;
    framework?: string;
    status?: string;
  }) {
    let userProjects = Array.from(projects.values()).filter(p => p.ownerId === userId);

    if (params.search) {
      const search = params.search.toLowerCase();
      userProjects = userProjects.filter(p =>
        p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)
      );
    }
    if (params.framework) userProjects = userProjects.filter(p => p.framework === params.framework);
    if (params.status) userProjects = userProjects.filter(p => p.status === params.status);

    const sortBy = params.sortBy || 'updatedAt';
    const sortOrder = params.sortOrder === 'asc' ? 1 : -1;
    userProjects.sort((a: any, b: any) => {
      if (a[sortBy] < b[sortBy]) return -1 * sortOrder;
      if (a[sortBy] > b[sortBy]) return 1 * sortOrder;
      return 0;
    });

    const total = userProjects.length;
    const offset = (params.page - 1) * params.pageSize;
    const paginated = userProjects.slice(offset, offset + params.pageSize);

    return {
      projects: paginated,
      total,
      page: params.page,
      pageSize: params.pageSize,
      hasMore: offset + params.pageSize < total,
    };
  }

  async updateProject(projectId: string, userId: string, data: { name?: string; description?: string; visibility?: string }) {
    const project = await this.getProject(projectId, userId);
    if (project.ownerId !== userId) throw new AuthorizationError('Only the owner can update this project');

    if (data.name) project.name = data.name;
    if (data.description) project.description = data.description;
    if (data.visibility) project.visibility = data.visibility;
    project.updatedAt = new Date();

    projects.set(projectId, project);

    eventBus.publish({
      type: EventTypes.PROJECT_UPDATED,
      payload: { projectId, changes: Object.keys(data) },
      timestamp: new Date(),
    });

    return project;
  }

  async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await this.getProject(projectId, userId);
    if (project.ownerId !== userId) throw new AuthorizationError('Only the owner can delete this project');

    projects.delete(projectId);

    eventBus.publish({
      type: EventTypes.PROJECT_DELETED,
      payload: { projectId },
      timestamp: new Date(),
    });
  }

  async updateProjectFiles(projectId: string, files: Array<{ path: string; content: string; action: string; language: string }>, userId: string) {
    const project = projects.get(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    for (const fileChange of files) {
      const existing = project.files.findIndex(f => f.path === fileChange.path);

      if (fileChange.action === 'delete') {
        if (existing !== -1) project.files.splice(existing, 1);
      } else if (fileChange.action === 'create' || existing === -1) {
        project.files.push({
          id: uuidv4(),
          path: fileChange.path,
          content: fileChange.content,
          language: fileChange.language,
          lastModifiedBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } else {
        project.files[existing].content = fileChange.content;
        project.files[existing].lastModifiedBy = userId;
        project.files[existing].updatedAt = new Date();
      }
    }

    project.metadata.totalFiles = project.files.length;
    project.metadata.totalSize = project.files.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf8'), 0);
    project.updatedAt = new Date();
    projects.set(projectId, project);

    return project;
  }

  async updateProjectStatus(projectId: string, status: string): Promise<void> {
    const project = projects.get(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    project.status = status;
    project.updatedAt = new Date();
    projects.set(projectId, project);
  }
}

export const projectService = new ProjectService();

import { NotFoundError, ForbiddenError } from '../../core/errors';
import { eventBus, EventTypes } from '../../core/events';
import { logger } from '../../core/logger';
import { ProjectRepository } from '../../infrastructure/database';
import { GenerationJobRepository } from '../../infrastructure/database';
import { codeGenerationQueue, sandboxExecutionQueue } from '../../infrastructure/queue';

const projectRepo = new ProjectRepository();
const genJobRepo = new GenerationJobRepository();

export class ProjectService {
  async create(
    ownerId: string,
    data: { name: string; description: string; framework: string; visibility?: string },
  ) {
    const project = await projectRepo.create({
      name: data.name,
      description: data.description,
      framework: data.framework as any,
      status: 'draft',
      visibility: (data.visibility || 'private') as any,
      owner_id: ownerId,
      current_version: 1,
      settings: {},
      metadata: {},
    });

    eventBus.publish({
      type: EventTypes.PROJECT_CREATED,
      payload: { projectId: project.id, ownerId },
      timestamp: new Date(),
    });

    logger.info('Project created', { projectId: project.id, ownerId });
    return this.toProjectResponse(project);
  }

  async getById(projectId: string, userId: string) {
    const result = await projectRepo.findWithFiles(projectId);
    if (!result) {
      throw new NotFoundError('Project', projectId);
    }
    if (result.project.visibility === 'private' && result.project.owner_id !== userId) {
      throw new ForbiddenError('Access denied to this project');
    }
    return {
      ...this.toProjectResponse(result.project),
      files: result.files.map((f) => ({
        id: f.id,
        path: f.path,
        content: f.content,
        language: f.language,
      })),
    };
  }

  async list(userId: string, params: { page?: number; pageSize?: number; sortBy?: string; sortOrder?: string }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const projects = await projectRepo.findByOwner(userId, pageSize, offset);
    const total = await projectRepo.count({ owner_id: userId } as any);

    return {
      projects: projects.map(this.toProjectResponse),
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
    };
  }

  async update(projectId: string, userId: string, data: { name?: string; description?: string; visibility?: string }) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.owner_id !== userId) throw new ForbiddenError('Only the owner can update this project');

    const updated = await projectRepo.update(projectId, data as any);

    eventBus.publish({
      type: EventTypes.PROJECT_UPDATED,
      payload: { projectId, changes: data },
      timestamp: new Date(),
    });

    return this.toProjectResponse(updated!);
  }

  async delete(projectId: string, userId: string): Promise<void> {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.owner_id !== userId) throw new ForbiddenError('Only the owner can delete this project');

    await projectRepo.delete(projectId);

    eventBus.publish({
      type: EventTypes.PROJECT_DELETED,
      payload: { projectId },
      timestamp: new Date(),
    });

    logger.info('Project deleted', { projectId });
  }

  /**
   * Queue AI code generation as an async job instead of blocking the HTTP request.
   * Returns the job ID immediately — the client listens via WebSocket for results.
   */
  async generateCode(projectId: string, userId: string, prompt: string, model?: string, provider?: string) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.owner_id !== userId) throw new ForbiddenError('Access denied');

    // Check user's daily usage
    const usage = await genJobRepo.getUserUsageToday(userId);
    if (usage.jobCount >= 100) {
      throw new ForbiddenError('Daily generation limit reached (100 requests). Upgrade your plan for more.');
    }

    // Create job record in DB
    const jobRecord = await genJobRepo.create({
      project_id: projectId,
      user_id: userId,
      prompt,
      model: model || 'gpt-4',
      provider: provider || 'openai',
      status: 'queued',
    });

    // Get existing project files for context
    const existingFiles = await projectRepo.getFiles(projectId);

    // Enqueue to BullMQ for async processing
    const bullJob = await codeGenerationQueue.add('generate', {
      jobId: jobRecord.id,
      projectId,
      userId,
      prompt,
      model: model || 'gpt-4',
      provider: provider || 'openai',
      framework: project.framework,
      existingFiles: existingFiles.map((f) => ({ path: f.path, content: f.content })),
    }, {
      priority: usage.jobCount < 10 ? 1 : 2, // Higher priority for low-usage users
      jobId: jobRecord.id,
    });

    logger.info('Code generation job queued', { jobId: jobRecord.id, bullJobId: bullJob.id, projectId });

    return {
      jobId: jobRecord.id,
      status: 'queued',
      message: 'Code generation queued. You will be notified via WebSocket when complete.',
    };
  }

  /**
   * Launch a sandboxed preview environment for a project
   */
  async launchSandbox(projectId: string, userId: string) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const files = await projectRepo.getFiles(projectId);
    const sandboxId = `sandbox_${projectId}_${Date.now().toString(36)}`;

    const job = await sandboxExecutionQueue.add('execute', {
      sandboxId,
      projectId,
      files: files.map((f) => ({ path: f.path, content: f.content })),
      framework: project.framework,
    }, {
      jobId: sandboxId,
      removeOnComplete: { age: 600 }, // Clean up after 10 minutes
    });

    logger.info('Sandbox execution queued', { sandboxId, projectId, jobId: job.id });

    return { sandboxId, status: 'queued' };
  }

  /**
   * Create a version snapshot of the current project state
   */
  async createSnapshot(projectId: string, userId: string, label?: string, description?: string) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.owner_id !== userId) throw new ForbiddenError('Access denied');

    const snapshot = await projectRepo.createSnapshot(projectId, userId, label, description);
    logger.info('Project snapshot created', { projectId, version: snapshot.version });
    return snapshot;
  }

  async getSnapshots(projectId: string, userId: string) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.owner_id !== userId) throw new ForbiddenError('Access denied');
    return projectRepo.getSnapshots(projectId);
  }

  async restoreSnapshot(projectId: string, userId: string, version: number) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    if (project.owner_id !== userId) throw new ForbiddenError('Access denied');
    await projectRepo.restoreSnapshot(projectId, version);
    logger.info('Project restored to version', { projectId, version });
  }

  /**
   * Get project by ID (internal use, no auth check)
   */
  async getProject(projectId: string, _userId: string) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);
    return this.toProjectResponse(project);
  }

  async updateProjectStatus(projectId: string, status: string) {
    await projectRepo.update(projectId, { status } as any);
  }

  private toProjectResponse(project: any) {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      framework: project.framework,
      status: project.status,
      visibility: project.visibility,
      ownerId: project.owner_id,
      currentVersion: project.current_version,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    };
  }
}

export const projectService = new ProjectService();

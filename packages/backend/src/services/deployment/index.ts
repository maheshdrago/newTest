import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';
import { DeploymentRepository } from '../../infrastructure/database';
import { ProjectRepository } from '../../infrastructure/database';
import { deploymentQueue } from '../../infrastructure/queue';

const deployRepo = new DeploymentRepository();
const projectRepo = new ProjectRepository();

export class DeploymentService {
  /**
   * Queue a deployment job. Writes project files to a Docker container,
   * builds, and runs it. The actual work happens in the deployment worker.
   */
  async deploy(projectId: string, userId: string) {
    const project = await projectRepo.findById(projectId);
    if (!project) throw new Error('Project not found');

    await projectRepo.update(projectId, { status: 'deploying' } as any);

    // Create deployment record in DB
    const deployment = await deployRepo.create({
      project_id: projectId,
      version: project.current_version,
      status: 'queued',
      build_logs: [],
      environment: {},
    });

    // Enqueue to BullMQ for async processing
    await deploymentQueue.add('deploy', {
      deploymentId: deployment.id,
      projectId,
      userId,
      version: project.current_version,
      environment: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    }, {
      jobId: deployment.id,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });

    eventBus.publish({
      type: EventTypes.PROJECT_DEPLOYED,
      payload: { projectId, deploymentId: deployment.id },
      timestamp: new Date(),
    });

    logger.info('Deployment queued', { projectId, deploymentId: deployment.id });

    return {
      id: deployment.id,
      status: 'queued',
      message: 'Deployment queued. You will be notified via WebSocket when complete.',
    };
  }

  async getDeployment(deploymentId: string) {
    return deployRepo.findById(deploymentId);
  }

  async getDeploymentsByProject(projectId: string) {
    return deployRepo.findByProject(projectId);
  }

  async getLiveDeployment(projectId: string) {
    return deployRepo.findLive(projectId);
  }

  /**
   * Rollback to a previous deployment by re-deploying that version
   */
  async rollback(projectId: string, userId: string, deploymentId: string) {
    const deployment = await deployRepo.findById(deploymentId);
    if (!deployment) throw new Error('Deployment not found');

    // Restore the project to that version
    await projectRepo.restoreSnapshot(projectId, deployment.version);

    // Re-deploy
    return this.deploy(projectId, userId);
  }
}

export const deploymentService = new DeploymentService();

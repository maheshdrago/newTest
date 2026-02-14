import { logger } from '../../core/logger';
import { eventBus, EventTypes } from '../../core/events';
import { projectService } from '../project';

interface Deployment {
  id: string;
  projectId: string;
  status: 'pending' | 'building' | 'deploying' | 'deployed' | 'failed';
  url?: string;
  logs: string[];
  startedAt: Date;
  completedAt?: Date;
}

const deployments = new Map<string, Deployment>();

export class DeploymentService {
  async deploy(projectId: string, userId: string): Promise<Deployment> {
    const project = await projectService.getProject(projectId, userId);
    await projectService.updateProjectStatus(projectId, 'deploying');

    const deployment: Deployment = {
      id: `deploy_${Date.now().toString(36)}`,
      projectId,
      status: 'pending',
      logs: [],
      startedAt: new Date(),
    };

    deployments.set(deployment.id, deployment);

    // Simulate deployment pipeline
    try {
      deployment.status = 'building';
      deployment.logs.push('Building project...');
      await new Promise(resolve => setTimeout(resolve, 100));

      deployment.status = 'deploying';
      deployment.logs.push('Deploying to cloud...');
      await new Promise(resolve => setTimeout(resolve, 100));

      deployment.status = 'deployed';
      deployment.url = `https://${project.name.toLowerCase().replace(/\s+/g, '-')}.buildcraft.app`;
      deployment.completedAt = new Date();
      deployment.logs.push(`Deployed successfully at ${deployment.url}`);

      await projectService.updateProjectStatus(projectId, 'deployed');

      eventBus.publish({
        type: EventTypes.PROJECT_DEPLOYED,
        payload: { projectId, deploymentId: deployment.id, url: deployment.url },
        timestamp: new Date(),
      });

      logger.info('Project deployed', { projectId, deploymentId: deployment.id, url: deployment.url });
    } catch (error) {
      deployment.status = 'failed';
      deployment.logs.push(`Deployment failed: ${(error as Error).message}`);
      await projectService.updateProjectStatus(projectId, 'error');
    }

    return deployment;
  }

  getDeployment(deploymentId: string): Deployment | undefined {
    return deployments.get(deploymentId);
  }

  getDeploymentsByProject(projectId: string): Deployment[] {
    return Array.from(deployments.values()).filter(d => d.projectId === projectId);
  }
}

export const deploymentService = new DeploymentService();

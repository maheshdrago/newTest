import { Job } from 'bullmq';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { createWorker } from '../connection';
import { QUEUE_NAMES } from '../queues';
import { logger } from '../../../core/logger';
import { eventBus } from '../../../core/events';
import { DeploymentRepository } from '../../database/repositories/deployment.repository';
import { ProjectRepository } from '../../database/repositories/project.repository';

const execAsync = promisify(exec);

export interface DeploymentJobData {
  deploymentId: string;
  projectId: string;
  userId: string;
  version: number;
  environment: Record<string, string>;
}

async function processDeployment(job: Job<DeploymentJobData>): Promise<{ url: string; containerId: string }> {
  const { deploymentId, projectId, userId, version, environment } = job.data;
  const deployRepo = new DeploymentRepository();
  const projectRepo = new ProjectRepository();

  logger.info('Processing deployment', { deploymentId, projectId, version });

  try {
    // 1. Update status to building
    await deployRepo.update(deploymentId, { status: 'building', started_at: new Date() } as any);
    await deployRepo.appendLog(deploymentId, 'Starting build process...');
    await job.updateProgress(10);

    // 2. Fetch project files from database
    const files = await projectRepo.getFiles(projectId, version);
    if (files.length === 0) throw new Error('No files found for project');
    await deployRepo.appendLog(deploymentId, `Found ${files.length} files`);
    await job.updateProgress(20);

    // 3. Write files to temporary build directory
    const buildDir = path.join(os.tmpdir(), 'buildcraft', `deploy-${deploymentId}`);
    await mkdir(buildDir, { recursive: true });

    for (const file of files) {
      const filePath = path.join(buildDir, file.path);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
    }
    await deployRepo.appendLog(deploymentId, 'Files written to build directory');
    await job.updateProgress(30);

    // 4. Generate Dockerfile for the project
    const project = await projectRepo.findById(projectId);
    const dockerfile = generateDockerfile(project?.framework || 'react');
    await writeFile(path.join(buildDir, 'Dockerfile'), dockerfile, 'utf-8');
    await deployRepo.appendLog(deploymentId, 'Dockerfile generated');
    await job.updateProgress(40);

    // 5. Build Docker image
    const imageName = `buildcraft-app-${projectId}:v${version}`;
    await deployRepo.update(deploymentId, { status: 'building' } as any);
    await deployRepo.appendLog(deploymentId, `Building Docker image: ${imageName}`);

    const { stdout: buildOutput } = await execAsync(
      `docker build -t ${imageName} --no-cache .`,
      { cwd: buildDir, timeout: 300000 } // 5 min timeout
    );
    logger.info('Docker build output', { deploymentId, output: buildOutput.slice(-500) });
    await deployRepo.appendLog(deploymentId, 'Docker image built successfully');
    await job.updateProgress(70);

    // 6. Run container
    await deployRepo.update(deploymentId, { status: 'deploying' } as any);
    const envFlags = Object.entries(environment).map(([k, v]) => `-e ${k}=${v}`).join(' ');
    const { stdout: containerId } = await execAsync(
      `docker run -d --restart unless-stopped --network buildcraft-net ${envFlags} ${imageName}`,
      { timeout: 60000 }
    );
    const trimmedContainerId = containerId.trim();
    await deployRepo.appendLog(deploymentId, `Container started: ${trimmedContainerId.slice(0, 12)}`);
    await job.updateProgress(85);

    // 7. Get assigned port
    const { stdout: portOutput } = await execAsync(
      `docker port ${trimmedContainerId} 3000`,
      { timeout: 10000 }
    );
    const port = portOutput.trim().split(':').pop();
    const url = `https://${projectId.slice(0, 8)}.buildcraft.app`;
    await job.updateProgress(95);

    // 8. Update deployment as live
    await deployRepo.update(deploymentId, {
      status: 'live', url, container_id: trimmedContainerId,
      completed_at: new Date(),
    } as any);
    await deployRepo.appendLog(deploymentId, `Deployed at ${url}`);

    eventBus.publish({
      type: 'deployment.completed',
      payload: { deploymentId, projectId, userId, url },
      timestamp: new Date(),
    });

    await job.updateProgress(100);
    return { url, containerId: trimmedContainerId };

  } catch (error: any) {
    await deployRepo.update(deploymentId, { status: 'failed', completed_at: new Date() } as any);
    await deployRepo.appendLog(deploymentId, `Deployment failed: ${error.message}`);
    eventBus.publish({
      type: 'deployment.failed',
      payload: { deploymentId, projectId, userId, error: error.message },
      timestamp: new Date(),
    });
    throw error;
  }
}

function generateDockerfile(framework: string): string {
  if (framework === 'nextjs') {
    return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next .next
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json .
EXPOSE 3000
CMD ["npm", "start"]`;
  }
  return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]`;
}

export const deploymentWorker = createWorker(QUEUE_NAMES.DEPLOYMENT, processDeployment, 1);

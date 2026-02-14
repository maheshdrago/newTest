import { Job } from 'bullmq';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { createWorker } from '../connection';
import { QUEUE_NAMES } from '../queues';
import { logger } from '../../../core/logger';

const execAsync = promisify(exec);

export interface SandboxJobData {
  sandboxId: string;
  projectId: string;
  files: Array<{ path: string; content: string }>;
  framework: string;
  command?: string;
}

export interface SandboxResult {
  sandboxId: string;
  containerId: string;
  url: string;
  port: number;
  status: 'running' | 'failed';
  logs: string[];
}

const SANDBOX_NETWORK = 'buildcraft-sandbox';
const SANDBOX_TIMEOUT = 300000; // 5 minutes per sandbox
const MAX_MEMORY = '256m';
const MAX_CPUS = '0.5';

async function processSandboxExecution(job: Job<SandboxJobData>): Promise<SandboxResult> {
  const { sandboxId, projectId, files, framework } = job.data;
  const logs: string[] = [];
  const sandboxDir = path.join(os.tmpdir(), 'buildcraft', 'sandbox', sandboxId);

  try {
    // 1. Create isolated filesystem
    await mkdir(sandboxDir, { recursive: true });
    logs.push('Created sandbox directory');
    await job.updateProgress(10);

    // 2. Write project files
    for (const file of files) {
      const filePath = path.join(sandboxDir, file.path);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
    }
    logs.push(`Wrote ${files.length} files`);
    await job.updateProgress(20);

    // 3. Generate package.json if missing
    const hasPackageJson = files.some(f => f.path === 'package.json');
    if (!hasPackageJson) {
      const pkg = generatePackageJson(framework);
      await writeFile(path.join(sandboxDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');
      logs.push('Generated package.json');
    }
    await job.updateProgress(30);

    // 4. Build Docker image with resource limits
    const dockerfilePath = path.join(sandboxDir, 'Dockerfile.sandbox');
    await writeFile(dockerfilePath, getSandboxDockerfile(framework), 'utf-8');
    const imageName = `buildcraft-sandbox-${sandboxId}`;

    await execAsync(`docker build -t ${imageName} -f Dockerfile.sandbox .`, {
      cwd: sandboxDir,
      timeout: 120000,
    });
    logs.push('Docker image built');
    await job.updateProgress(60);

    // 5. Run container with strict resource limits and network isolation
    const { stdout: containerId } = await execAsync(
      `docker run -d \
        --name sandbox-${sandboxId} \
        --memory=${MAX_MEMORY} \
        --cpus=${MAX_CPUS} \
        --network=${SANDBOX_NETWORK} \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=64m \
        --security-opt=no-new-privileges \
        --cap-drop=ALL \
        -P \
        ${imageName}`,
      { timeout: 30000 }
    );
    const trimmedId = containerId.trim();
    logs.push(`Container started: ${trimmedId.slice(0, 12)}`);
    await job.updateProgress(80);

    // 6. Get mapped port
    const { stdout: portOutput } = await execAsync(`docker port sandbox-${sandboxId} 3000`, { timeout: 5000 });
    const port = parseInt(portOutput.trim().split(':').pop() || '0');
    const url = `http://localhost:${port}`;
    logs.push(`Preview available at ${url}`);
    await job.updateProgress(90);

    // 7. Set auto-cleanup timer (sandbox auto-destroys after timeout)
    setTimeout(async () => {
      try {
        await execAsync(`docker rm -f sandbox-${sandboxId}`);
        await rm(sandboxDir, { recursive: true, force: true });
        logger.info('Sandbox cleaned up', { sandboxId });
      } catch (e) {
        logger.warn('Sandbox cleanup failed', { sandboxId, error: (e as Error).message });
      }
    }, SANDBOX_TIMEOUT);

    await job.updateProgress(100);
    return { sandboxId, containerId: trimmedId, url, port, status: 'running', logs };

  } catch (error: any) {
    logs.push(`Error: ${error.message}`);
    // Cleanup on failure
    try {
      await execAsync(`docker rm -f sandbox-${sandboxId}`).catch(() => {});
      await rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
    } catch (e) { /* ignore cleanup errors */ }
    return { sandboxId, containerId: '', url: '', port: 0, status: 'failed', logs };
  }
}

function getSandboxDockerfile(framework: string): string {
  return `FROM node:20-alpine
RUN addgroup -g 1001 sandbox && adduser -u 1001 -G sandbox -D sandbox
WORKDIR /app
COPY package*.json ./
RUN npm ci --production 2>/dev/null || npm install --production
COPY . .
RUN chown -R sandbox:sandbox /app
USER sandbox
EXPOSE 3000
CMD ["npm", "start"]`;
}

function generatePackageJson(framework: string): Record<string, any> {
  const base: Record<string, any> = {
    name: 'buildcraft-sandbox-app',
    version: '1.0.0',
    private: true,
    scripts: { start: 'node server.js', dev: 'node server.js' },
  };
  if (framework === 'react') {
    base.scripts.start = 'npx serve -s build -l 3000';
    base.dependencies = { serve: '^14.0.0' };
  } else if (framework === 'nextjs') {
    base.scripts = { dev: 'next dev -p 3000', start: 'next start -p 3000', build: 'next build' };
    base.dependencies = { next: '^14.0.0', react: '^18.0.0', 'react-dom': '^18.0.0' };
  }
  return base;
}

export const sandboxWorker = createWorker(QUEUE_NAMES.SANDBOX_EXECUTION, processSandboxExecution, 3);

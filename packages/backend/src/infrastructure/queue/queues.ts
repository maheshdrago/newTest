import { createQueue } from './connection';

// Define all application queues
export const codeGenerationQueue = createQueue('code-generation');
export const deploymentQueue = createQueue('deployment');
export const sandboxExecutionQueue = createQueue('sandbox-execution');
export const notificationQueue = createQueue('notification');

export const QUEUE_NAMES = {
  CODE_GENERATION: 'code-generation',
  DEPLOYMENT: 'deployment',
  SANDBOX_EXECUTION: 'sandbox-execution',
  NOTIFICATION: 'notification',
} as const;

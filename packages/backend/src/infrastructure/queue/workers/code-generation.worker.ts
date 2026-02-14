import { Job } from 'bullmq';
import { createWorker } from '../connection';
import { QUEUE_NAMES } from '../queues';
import { logger } from '../../../core/logger';
import { eventBus } from '../../../core/events';
import { GenerationJobRepository } from '../../database/repositories/generation-job.repository';
import { ProjectRepository } from '../../database/repositories/project.repository';

export interface CodeGenerationJobData {
  jobId: string;
  projectId: string;
  userId: string;
  prompt: string;
  model: string;
  provider: string;
  framework: string;
  existingFiles: Array<{ path: string; content: string }>;
}

export interface CodeGenerationResult {
  files: Array<{ path: string; content: string; language: string; action: 'create' | 'update' | 'delete' }>;
  message: string;
  tokensUsed: number;
  cost: number;
}

async function processCodeGeneration(job: Job<CodeGenerationJobData>): Promise<CodeGenerationResult> {
  const { jobId, projectId, userId, prompt, model, provider, framework, existingFiles } = job.data;
  const genJobRepo = new GenerationJobRepository();
  const projectRepo = new ProjectRepository();
  const startTime = Date.now();

  logger.info('Processing code generation job', { jobId, projectId, model, provider });

  await genJobRepo.markProcessing(jobId);
  await job.updateProgress(10);

  // Emit progress event via event bus
  eventBus.publish({ type: 'generation.started', payload: { jobId, projectId, userId }, timestamp: new Date() });

  try {
    // Build the system prompt with context
    const systemPrompt = buildSystemPrompt(framework, existingFiles);
    await job.updateProgress(20);

    // Call AI provider
    const { OpenAI } = await import('openai');
    const { Anthropic } = await import('@anthropic-ai/sdk');

    let result: CodeGenerationResult;

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });
      await job.updateProgress(70);
      const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      result = parseAIResponse(text);
      result.tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
      result.cost = estimateCost(provider, model, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);
    } else {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: model || 'gpt-4',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
        max_tokens: 8192,
        temperature: 0.7,
      });
      await job.updateProgress(70);
      const text = response.choices[0]?.message?.content || '';
      result = parseAIResponse(text);
      result.tokensUsed = response.usage?.total_tokens || 0;
      result.cost = estimateCost(provider, model, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0);
    }

    await job.updateProgress(80);

    // Persist generated files to database
    const project = await projectRepo.findById(projectId);
    if (project) {
      for (const file of result.files) {
        if (file.action === 'delete') {
          await projectRepo.deleteFile(projectId, file.path, project.current_version);
        } else {
          await projectRepo.upsertFile(projectId, file.path, file.content, file.language, project.current_version);
        }
      }
    }

    await job.updateProgress(90);

    const durationMs = Date.now() - startTime;
    await genJobRepo.markCompleted(jobId, result, result.tokensUsed, result.cost, durationMs);

    eventBus.publish({
      type: 'generation.completed',
      payload: { jobId, projectId, userId, filesChanged: result.files.length, tokensUsed: result.tokensUsed },
      timestamp: new Date(),
    });

    await job.updateProgress(100);
    return result;

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    await genJobRepo.markFailed(jobId, error.message);
    eventBus.publish({
      type: 'generation.failed',
      payload: { jobId, projectId, userId, error: error.message },
      timestamp: new Date(),
    });
    throw error;
  }
}

function buildSystemPrompt(framework: string, existingFiles: Array<{ path: string; content: string }>): string {
  const fileList = existingFiles.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
  return `You are an expert ${framework} developer. Generate production-ready code.

RULES:
- Output ONLY file blocks in this format: === FILE: path/to/file.ext ===\n<code>\n=== END FILE ===
- Include ALL necessary files for a working application
- Use TypeScript where applicable
- Follow best practices for ${framework}
- Include proper error handling and types

${existingFiles.length > 0 ? `EXISTING PROJECT FILES:\n${fileList}` : 'This is a new project. Generate the initial file structure.'}`;
}

function parseAIResponse(text: string): CodeGenerationResult {
  const files: CodeGenerationResult['files'] = [];
  const fileRegex = /=== FILE: (.+?) ===([\s\S]*?)=== END FILE ===/g;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    const path = match[1].trim();
    const content = match[2].trim();
    const ext = path.split('.').pop() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      css: 'css', html: 'html', json: 'json', md: 'markdown', py: 'python',
      sql: 'sql', yaml: 'yaml', yml: 'yaml', sh: 'bash',
    };
    files.push({ path, content, language: langMap[ext] || ext, action: 'create' });
  }

  // Extract explanation text (everything outside file blocks)
  const message = text.replace(/=== FILE: .+? ===[\s\S]*?=== END FILE ===/g, '').trim() || 'Code generated successfully.';
  return { files, message, tokensUsed: 0, cost: 0 };
}

function estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
  const rates: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
    'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'claude-sonnet-4-20250514': { input: 0.003 / 1000, output: 0.015 / 1000 },
    'claude-opus-4-20250514': { input: 0.015 / 1000, output: 0.075 / 1000 },
  };
  const rate = rates[model] || { input: 0.01 / 1000, output: 0.03 / 1000 };
  return inputTokens * rate.input + outputTokens * rate.output;
}

// Create and export the worker
export const codeGenerationWorker = createWorker(
  QUEUE_NAMES.CODE_GENERATION,
  processCodeGeneration,
  2 // concurrency: 2 parallel AI calls
);

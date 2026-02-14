import { config } from '../../core/config';
import { AIGenerationError } from '../../core/errors';
import { CircuitBreaker } from '../../patterns/circuit-breaker';
import { withRetry } from '../../patterns/retry';
import { eventBus, EventTypes } from '../../core/events';
import { logger } from '../../core/logger';

interface GenerationRequest {
  projectId: string;
  prompt: string;
  context?: {
    existingFiles?: Array<{ path: string; content: string }>;
    projectFramework: string;
    projectDescription: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  };
  options?: {
    model?: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  };
}

interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
  language: string;
}

interface GenerationResult {
  id: string;
  message: string;
  fileChanges: FileChange[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

export class AIService {
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      name: 'ai-provider',
      failureThreshold: config.CB_FAILURE_THRESHOLD,
      recoveryTimeout: config.CB_RECOVERY_TIMEOUT,
      successThreshold: config.CB_SUCCESS_THRESHOLD,
    });
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const generationId = `gen_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;

    eventBus.publish({
      type: EventTypes.AI_GENERATION_STARTED,
      payload: { generationId, projectId: request.projectId },
      timestamp: new Date(),
    });

    try {
      const result = await this.circuitBreaker.execute(() =>
        withRetry(
          () => this.callAIProvider(generationId, request),
          { maxAttempts: 3, baseDelayMs: 2000 },
          'AI generation',
        ),
      );

      eventBus.publish({
        type: EventTypes.AI_GENERATION_COMPLETED,
        payload: { generationId, projectId: request.projectId, usage: result.usage },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      eventBus.publish({
        type: EventTypes.AI_GENERATION_FAILED,
        payload: { generationId, projectId: request.projectId, error: (error as Error).message },
        timestamp: new Date(),
      });
      throw error;
    }
  }

  private async callAIProvider(generationId: string, request: GenerationRequest): Promise<GenerationResult> {
    const provider = request.options?.provider || config.AI_PROVIDER;
    const model = request.options?.model;
    const maxTokens = request.options?.maxTokens || 8192;
    const temperature = request.options?.temperature || 0.7;

    logger.info('Calling AI provider', { generationId, provider, projectId: request.projectId });

    const systemPrompt = this.buildSystemPrompt(request);
    const startTime = Date.now();

    let responseText: string;
    let promptTokens = 0;
    let completionTokens = 0;

    if (provider === 'anthropic') {
      if (!config.ANTHROPIC_API_KEY) throw new AIGenerationError('Anthropic API key not configured');

      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

      const response = await client.messages.create({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: request.prompt }],
      });

      responseText = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');
      promptTokens = response.usage?.input_tokens || 0;
      completionTokens = response.usage?.output_tokens || 0;
    } else {
      if (!config.OPENAI_API_KEY) throw new AIGenerationError('OpenAI API key not configured');

      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });

      const response = await client.chat.completions.create({
        model: model || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: request.prompt },
        ],
        max_tokens: maxTokens,
        temperature,
      });

      responseText = response.choices[0]?.message?.content || '';
      promptTokens = response.usage?.prompt_tokens || 0;
      completionTokens = response.usage?.completion_tokens || 0;
    }

    const duration = Date.now() - startTime;
    const fileChanges = this.parseFileChanges(responseText);
    const totalTokens = promptTokens + completionTokens;
    const estimatedCost = this.estimateCost(provider, model || '', promptTokens, completionTokens);

    // Extract message (explanation text outside of file blocks)
    const message = responseText
      .replace(/=== FILE: .+? ===([\s\S]*?)=== END FILE ===/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .trim() || `Generated ${fileChanges.length} files successfully.`;

    logger.info('AI generation completed', {
      generationId,
      duration: `${duration}ms`,
      filesGenerated: fileChanges.length,
      tokensUsed: totalTokens,
      cost: estimatedCost,
    });

    return {
      id: generationId,
      message,
      fileChanges,
      usage: { promptTokens, completionTokens, totalTokens, estimatedCost },
    };
  }

  private buildSystemPrompt(request: GenerationRequest): string {
    const framework = request.context?.projectFramework || 'react';
    const existingFiles = request.context?.existingFiles || [];

    let prompt = `You are an expert full-stack developer specializing in ${framework}. Generate production-ready code.

OUTPUT FORMAT: Output code files using this EXACT format:
=== FILE: path/to/file.ext ===
<file content here>
=== END FILE ===

RULES:
- Generate ONLY the files that need to change
- Use TypeScript for type safety
- Follow ${framework} best practices
- Include proper error handling
- Write clean, maintainable code
- Use modern framework features and patterns`;

    if (existingFiles.length > 0) {
      prompt += `\n\nEXISTING PROJECT FILES:\n`;
      for (const file of existingFiles.slice(0, 20)) { // Limit context to 20 files
        prompt += `\n--- ${file.path} ---\n${file.content.slice(0, 2000)}\n`;
      }
    }

    if (request.context?.projectDescription) {
      prompt += `\n\nPROJECT DESCRIPTION: ${request.context.projectDescription}`;
    }

    return prompt;
  }

  private parseFileChanges(text: string): FileChange[] {
    const files: FileChange[] = [];
    const fileRegex = /=== FILE: (.+?) ===([\s\S]*?)=== END FILE ===/g;
    let match;

    while ((match = fileRegex.exec(text)) !== null) {
      const path = match[1].trim();
      const content = match[2].trim();
      const ext = path.split('.').pop() || '';
      const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
        css: 'css', html: 'html', json: 'json', md: 'markdown', py: 'python',
        sql: 'sql', yaml: 'yaml', yml: 'yaml', sh: 'bash', vue: 'vue', svelte: 'svelte',
      };
      files.push({ path, content, language: langMap[ext] || ext, action: 'create' });
    }

    return files;
  }

  private estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number): number {
    const rates: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
      'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
      'gpt-4o': { input: 0.005 / 1000, output: 0.015 / 1000 },
      'claude-sonnet-4-20250514': { input: 0.003 / 1000, output: 0.015 / 1000 },
      'claude-opus-4-20250514': { input: 0.015 / 1000, output: 0.075 / 1000 },
    };
    const rate = rates[model] || { input: 0.01 / 1000, output: 0.03 / 1000 };
    return inputTokens * rate.input + outputTokens * rate.output;
  }

  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStats();
  }
}

export const aiService = new AIService();

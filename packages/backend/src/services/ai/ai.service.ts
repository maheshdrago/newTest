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
      failureThreshold: config.circuitBreaker.failureThreshold,
      recoveryTimeout: config.circuitBreaker.recoveryTimeout,
      successThreshold: config.circuitBreaker.successThreshold,
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
    logger.info('Calling AI provider', {
      generationId,
      provider: config.ai.provider,
      projectId: request.projectId,
    });

    const systemPrompt = this.buildSystemPrompt(request);
    const startTime = Date.now();

    // Simulated AI response for demo purposes
    // In production, this would call OpenAI/Anthropic API
    const fileChanges = this.generateDemoResponse(request);
    const duration = Date.now() - startTime;

    logger.info('AI generation completed', { generationId, duration: `${duration}ms`, filesGenerated: fileChanges.length });

    return {
      id: generationId,
      message: `Generated ${fileChanges.length} files based on your prompt. The application structure includes components, styling, and configuration.`,
      fileChanges,
      usage: {
        promptTokens: systemPrompt.length / 4,
        completionTokens: fileChanges.reduce((sum, f) => sum + f.content.length / 4, 0),
        totalTokens: 0,
        estimatedCost: 0,
      },
    };
  }

  private buildSystemPrompt(request: GenerationRequest): string {
    return `You are an expert full-stack developer. Generate production-ready code for a ${request.context?.projectFramework || 'react'} application.

Project: ${request.context?.projectDescription || 'No description provided'}

Requirements:
- Use TypeScript for type safety
- Follow best practices and design patterns
- Include proper error handling
- Generate clean, maintainable code
- Use modern framework features

User Request: ${request.prompt}

${request.context?.existingFiles?.length ? `Existing files:\n${request.context.existingFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')}` : ''}`;
  }

  private generateDemoResponse(request: GenerationRequest): FileChange[] {
    const framework = request.context?.projectFramework || 'react';
    const files: FileChange[] = [];

    if (framework === 'react' || framework === 'nextjs') {
      files.push(
        {
          path: 'src/App.tsx',
          content: `import React from 'react';\nimport { Layout } from './components/Layout';\nimport { AppProvider } from './providers/AppProvider';\n\nexport default function App() {\n  return (\n    <AppProvider>\n      <Layout>\n        <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">\n          <h1 className="text-4xl font-bold text-center py-12">Welcome to Your App</h1>\n        </main>\n      </Layout>\n    </AppProvider>\n  );\n}\n`,
          action: 'create',
          language: 'typescript',
        },
        {
          path: 'src/components/Layout.tsx',
          content: `import React from 'react';\n\ninterface LayoutProps {\n  children: React.ReactNode;\n}\n\nexport function Layout({ children }: LayoutProps) {\n  return (\n    <div className="flex flex-col min-h-screen">\n      <header className="bg-white shadow-sm border-b">\n        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">\n          <span className="text-xl font-semibold">App</span>\n        </nav>\n      </header>\n      <main className="flex-1">{children}</main>\n      <footer className="bg-gray-50 border-t py-8 text-center text-sm text-gray-500">\n        Built with BuildCraft AI\n      </footer>\n    </div>\n  );\n}\n`,
          action: 'create',
          language: 'typescript',
        },
        {
          path: 'package.json',
          content: JSON.stringify({
            name: 'generated-app',
            version: '0.1.0',
            private: true,
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0',
              typescript: '^5.4.0',
            },
          }, null, 2),
          action: 'create',
          language: 'json',
        },
      );
    }

    return files;
  }

  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStats();
  }
}

export const aiService = new AIService();

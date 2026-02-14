import { logger } from '../../core/logger';
import { AIProviderError } from '../../core/errors';
import { CircuitBreaker } from '../../patterns/circuit-breaker';
import { withRetry } from '../../patterns/retry';
import { config } from '../../core/config';
import { eventBus, EventTypes } from '../../core/events';
import { projectService } from '../project';

interface GenerationRequest {
  projectId: string;
  prompt: string;
  userId: string;
  existingFiles?: Array<{ path: string; content: string }>;
  framework: string;
  options?: {
    model?: string;
    temperature?: number;
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

const aiCircuitBreaker = new CircuitBreaker({
  name: 'ai-provider',
  failureThreshold: config.CB_FAILURE_THRESHOLD,
  recoveryTimeout: config.CB_RECOVERY_TIMEOUT,
  successThreshold: config.CB_SUCCESS_THRESHOLD,
});

export class AIService {
  async generateCode(request: GenerationRequest): Promise<GenerationResult> {
    const generationId = `gen_${Date.now().toString(36)}`;

    logger.info('AI generation started', {
      generationId,
      projectId: request.projectId,
      promptLength: request.prompt.length,
    });

    eventBus.publish({
      type: EventTypes.AI_GENERATION_STARTED,
      payload: { generationId, projectId: request.projectId, userId: request.userId },
      timestamp: new Date(),
    });

    try {
      await projectService.updateProjectStatus(request.projectId, 'generating');

      const result = await aiCircuitBreaker.execute(
        () => withRetry(
          () => this.callAIProvider(request, generationId),
          { maxAttempts: 2, baseDelayMs: 2000 }
        ),
        () => this.getFallbackResponse(generationId)
      );

      // Apply file changes to project
      await projectService.updateProjectFiles(
        request.projectId,
        result.fileChanges,
        request.userId
      );
      await projectService.updateProjectStatus(request.projectId, 'ready');

      eventBus.publish({
        type: EventTypes.AI_GENERATION_COMPLETED,
        payload: { generationId, projectId: request.projectId, filesChanged: result.fileChanges.length },
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      await projectService.updateProjectStatus(request.projectId, 'error');

      eventBus.publish({
        type: EventTypes.AI_GENERATION_FAILED,
        payload: { generationId, projectId: request.projectId, error: (error as Error).message },
        timestamp: new Date(),
      });

      throw error;
    }
  }

  private async callAIProvider(request: GenerationRequest, generationId: string): Promise<GenerationResult> {
    // Simulate AI provider call - in production, integrate with OpenAI/Anthropic
    const startTime = Date.now();

    const systemPrompt = this.buildSystemPrompt(request.framework);
    const userPrompt = this.buildUserPrompt(request.prompt, request.existingFiles);

    // Simulated response - replace with actual API call
    logger.info('Calling AI provider', { provider: config.AI_PROVIDER, generationId });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const fileChanges = this.generateMockFileChanges(request.framework, request.prompt);

    const duration = Date.now() - startTime;
    const estimatedTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);

    return {
      id: generationId,
      message: `Generated ${fileChanges.length} files for your ${request.framework} application based on your prompt. The project includes components, styling, and configuration files.`,
      fileChanges,
      usage: {
        promptTokens: estimatedTokens,
        completionTokens: Math.ceil(estimatedTokens * 1.5),
        totalTokens: Math.ceil(estimatedTokens * 2.5),
        estimatedCost: (estimatedTokens * 2.5 * 0.00003),
      },
    };
  }

  private buildSystemPrompt(framework: string): string {
    return `You are BuildCraft AI, an expert full-stack developer. Generate production-ready ${framework} code.
Follow best practices:
- Clean, maintainable code with proper TypeScript types
- Responsive design with modern CSS/Tailwind
- Proper error handling and loading states
- Accessibility (WCAG 2.1 AA)
- Performance optimized
- SEO friendly where applicable

Output file changes as structured JSON with path, content, action, and language fields.`;
  }

  private buildUserPrompt(prompt: string, existingFiles?: Array<{ path: string; content: string }>): string {
    let fullPrompt = `User Request: ${prompt}\n\n`;
    if (existingFiles?.length) {
      fullPrompt += 'Existing project files:\n';
      for (const file of existingFiles) {
        fullPrompt += `\n--- ${file.path} ---\n${file.content}\n`;
      }
    }
    return fullPrompt;
  }

  private generateMockFileChanges(framework: string, _prompt: string): FileChange[] {
    const baseFiles: FileChange[] = [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: 'generated-app',
          version: '0.1.0',
          private: true,
          scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
          dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', next: '^14.0.0' },
        }, null, 2),
        action: 'create',
        language: 'json',
      },
      {
        path: 'src/app/layout.tsx',
        content: `import type { Metadata } from 'next';\nimport './globals.css';\n\nexport const metadata: Metadata = {\n  title: 'Generated App',\n  description: 'Built with BuildCraft AI',\n};\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}`,
        action: 'create',
        language: 'typescript',
      },
      {
        path: 'src/app/page.tsx',
        content: `export default function Home() {\n  return (\n    <main className="min-h-screen p-8">\n      <h1 className="text-4xl font-bold">Welcome to Your App</h1>\n      <p className="mt-4 text-gray-600">Generated by BuildCraft AI</p>\n    </main>\n  );\n}`,
        action: 'create',
        language: 'typescript',
      },
      {
        path: 'src/app/globals.css',
        content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root {\n  --foreground: #171717;\n  --background: #ffffff;\n}\n\nbody {\n  color: var(--foreground);\n  background: var(--background);\n  font-family: system-ui, sans-serif;\n}`,
        action: 'create',
        language: 'css',
      },
      {
        path: 'tailwind.config.ts',
        content: `import type { Config } from 'tailwindcss';\n\nconst config: Config = {\n  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],\n  theme: { extend: {} },\n  plugins: [],\n};\n\nexport default config;`,
        action: 'create',
        language: 'typescript',
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify({
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            jsx: 'preserve',
            module: 'esnext',
            moduleResolution: 'bundler',
            strict: true,
            paths: { '@/*': ['./src/*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
          exclude: ['node_modules'],
        }, null, 2),
        action: 'create',
        language: 'json',
      },
    ];

    return baseFiles;
  }

  private async getFallbackResponse(generationId: string): Promise<GenerationResult> {
    logger.warn('Using fallback response due to AI provider unavailability', { generationId });
    return {
      id: generationId,
      message: 'AI provider is temporarily unavailable. A basic project template has been generated.',
      fileChanges: [
        {
          path: 'src/app/page.tsx',
          content: `export default function Home() {\n  return <main><h1>App Generated</h1><p>AI provider was unavailable. Edit this file to get started.</p></main>;\n}`,
          action: 'create',
          language: 'typescript',
        },
      ],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
    };
  }

  getCircuitBreakerStatus() {
    return aiCircuitBreaker.getStats();
  }
}

export const aiService = new AIService();

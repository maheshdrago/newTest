export interface AIGenerationRequest {
  projectId: string;
  prompt: string;
  context?: AIContext;
  options?: AIGenerationOptions;
}

export interface AIContext {
  existingFiles?: Array<{ path: string; content: string }>;
  projectFramework: string;
  projectDescription: string;
  conversationHistory?: AIMessage[];
}

export interface AIGenerationOptions {
  model?: AIModel;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export enum AIModel {
  GPT4 = 'gpt-4',
  GPT4_TURBO = 'gpt-4-turbo',
  CLAUDE_3_OPUS = 'claude-3-opus',
  CLAUDE_3_SONNET = 'claude-3-sonnet',
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: AIMessageMetadata;
}

export interface AIMessageMetadata {
  model: string;
  tokensUsed: number;
  generationTimeMs: number;
  filesModified?: string[];
}

export interface AIGenerationResponse {
  id: string;
  status: AIGenerationStatus;
  message: AIMessage;
  fileChanges: FileChange[];
  usage: AIUsage;
}

export enum AIGenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  STREAMING = 'streaming',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
  language: string;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface AIStreamChunk {
  type: 'text' | 'file_change' | 'status' | 'error' | 'done';
  content?: string;
  fileChange?: FileChange;
  status?: AIGenerationStatus;
  error?: string;
}

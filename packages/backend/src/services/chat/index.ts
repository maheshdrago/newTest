import { logger } from '../../core/logger';
import { ChatRepository } from '../../infrastructure/database';
import { NotFoundError } from '../../core/errors';

const chatRepo = new ChatRepository();

export class ChatService {
  /**
   * Get conversation history for a project
   */
  async getMessages(projectId: string, limit = 100, offset = 0) {
    const messages = await chatRepo.getProjectMessages(projectId, limit, offset);
    return messages.map(this.toResponse);
  }

  /**
   * Save a user message
   */
  async addUserMessage(projectId: string, userId: string, content: string) {
    const message = await chatRepo.addMessage({
      projectId,
      userId,
      role: 'user',
      content,
    });
    return this.toResponse(message);
  }

  /**
   * Save an assistant (AI) response, linked to a generation job
   */
  async addAssistantMessage(
    projectId: string,
    content: string,
    generationJobId?: string,
    fileChanges?: any[],
    metadata?: Record<string, any>,
  ) {
    const message = await chatRepo.addMessage({
      projectId,
      role: 'assistant',
      content,
      generationJobId,
      fileChanges,
      metadata,
    });
    return this.toResponse(message);
  }

  /**
   * Save a system message (e.g., deployment notification)
   */
  async addSystemMessage(projectId: string, content: string) {
    const message = await chatRepo.addMessage({
      projectId,
      role: 'system',
      content,
    });
    return this.toResponse(message);
  }

  async getMessageCount(projectId: string): Promise<number> {
    return chatRepo.getMessageCount(projectId);
  }

  async clearHistory(projectId: string): Promise<number> {
    return chatRepo.deleteProjectMessages(projectId);
  }

  private toResponse(msg: any) {
    return {
      id: msg.id,
      projectId: msg.project_id,
      userId: msg.user_id,
      role: msg.role,
      content: msg.content,
      generationJobId: msg.generation_job_id,
      fileChanges: msg.file_changes,
      metadata: msg.metadata,
      createdAt: msg.created_at,
    };
  }
}

export const chatService = new ChatService();

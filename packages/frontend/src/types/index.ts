export type Framework = 'react' | 'nextjs' | 'vue' | 'svelte' | 'vanilla';
export type ProjectStatus = 'draft' | 'generating' | 'ready' | 'deploying' | 'deployed' | 'error' | 'archived';
export type Visibility = 'private' | 'public' | 'team';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  fileChanges?: FileChange[];
  isStreaming?: boolean;
}

export interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
  language: string;
}

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeItem[];
  language?: string;
}

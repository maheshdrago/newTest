export interface CollaborationSession {
  id: string;
  projectId: string;
  participants: Participant[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Participant {
  userId: string;
  name: string;
  avatarUrl?: string;
  role: CollaborationRole;
  cursor?: CursorPosition;
  isOnline: boolean;
  joinedAt: Date;
}

export enum CollaborationRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export interface CursorPosition {
  fileId: string;
  line: number;
  column: number;
}

export enum WebSocketEvent {
  // Connection
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  HEARTBEAT = 'heartbeat',

  // Collaboration
  JOIN_SESSION = 'join_session',
  LEAVE_SESSION = 'leave_session',
  CURSOR_MOVE = 'cursor_move',
  FILE_CHANGE = 'file_change',
  
  // AI
  AI_GENERATION_START = 'ai_generation_start',
  AI_GENERATION_STREAM = 'ai_generation_stream',
  AI_GENERATION_COMPLETE = 'ai_generation_complete',
  AI_GENERATION_ERROR = 'ai_generation_error',

  // Notifications
  NOTIFICATION = 'notification',
  PROJECT_UPDATE = 'project_update',
  USER_JOINED = 'user_joined',
  USER_LEFT = 'user_left',
}

export interface WebSocketMessage<T = unknown> {
  event: WebSocketEvent;
  payload: T;
  timestamp: number;
  senderId?: string;
}

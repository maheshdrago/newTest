export const APP_CONSTANTS = {
  APP_NAME: 'BuildCraft AI',
  APP_VERSION: '1.0.0',
  API_VERSION: 'v1',
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_PROJECT_FILES: 500,
  MAX_PROMPT_LENGTH: 10000,
  MAX_PROJECT_NAME_LENGTH: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  SUPPORTED_LANGUAGES: [
    'typescript', 'javascript', 'html', 'css', 'json',
    'markdown', 'python', 'yaml', 'sql', 'shell',
  ],
  SUPPORTED_FRAMEWORKS: ['react', 'nextjs', 'vue', 'svelte', 'vanilla'],
} as const;

export const ERROR_CODES = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  
  // Project
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_LIMIT_EXCEEDED: 'PROJECT_LIMIT_EXCEEDED',
  PROJECT_NAME_TAKEN: 'PROJECT_NAME_TAKEN',
  
  // AI
  AI_GENERATION_FAILED: 'AI_GENERATION_FAILED',
  AI_RATE_LIMIT_EXCEEDED: 'AI_RATE_LIMIT_EXCEEDED',
  AI_CONTEXT_TOO_LARGE: 'AI_CONTEXT_TOO_LARGE',
  AI_PROVIDER_UNAVAILABLE: 'AI_PROVIDER_UNAVAILABLE',
  
  // General
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export const PLAN_LIMITS = {
  free: { projects: 3, aiRequestsPerDay: 10, collaborators: 0, storage: 50 * 1024 * 1024 },
  pro: { projects: 25, aiRequestsPerDay: 100, collaborators: 5, storage: 500 * 1024 * 1024 },
  team: { projects: 100, aiRequestsPerDay: 500, collaborators: 25, storage: 2 * 1024 * 1024 * 1024 },
  enterprise: { projects: -1, aiRequestsPerDay: -1, collaborators: -1, storage: -1 }, // -1 = unlimited
} as const;

import { z } from 'zod';

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s\-_]+$/, 'Invalid project name characters'),
    description: z.string().min(1).max(1000),
    framework: z.enum(['react', 'nextjs', 'vue', 'svelte', 'vanilla']),
    visibility: z.enum(['private', 'public', 'team']).optional().default('private'),
    prompt: z.string().max(10000).optional(),
  }),
});

export const updateProjectSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s\-_]+$/).optional(),
    description: z.string().min(1).max(1000).optional(),
    visibility: z.enum(['private', 'public', 'team']).optional(),
  }),
});

export const generateCodeSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    prompt: z.string().min(1).max(10000),
    options: z.object({
      model: z.enum(['gpt-4', 'gpt-4-turbo', 'claude-3-opus', 'claude-3-sonnet']).optional(),
      temperature: z.number().min(0).max(2).optional(),
      stream: z.boolean().optional().default(true),
    }).optional(),
  }),
});

export const paginationSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name']).optional().default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    search: z.string().optional(),
    framework: z.enum(['react', 'nextjs', 'vue', 'svelte', 'vanilla']).optional(),
    status: z.enum(['draft', 'generating', 'ready', 'deploying', 'deployed', 'error', 'archived']).optional(),
  }),
});

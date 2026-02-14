import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../core/errors';

const createProjectSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s\-_]+$/),
  description: z.string().min(1).max(1000),
  framework: z.enum(['react', 'nextjs', 'vue', 'svelte', 'vanilla']),
  visibility: z.enum(['private', 'public', 'team']).optional().default('private'),
  prompt: z.string().max(10000).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s\-_]+$/).optional(),
  description: z.string().min(1).max(1000).optional(),
  visibility: z.enum(['private', 'public', 'team']).optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

function validate(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten();
      throw new ValidationError('Validation failed', { fieldErrors: errors.fieldErrors });
    }
    req.body = result.data;
    next();
  };
}

function validateQuery(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.flatten();
      throw new ValidationError('Invalid query parameters', { fieldErrors: errors.fieldErrors });
    }
    req.query = result.data;
    next();
  };
}

export const projectValidators = {
  create: validate(createProjectSchema),
  update: validate(updateProjectSchema),
  list: validateQuery(paginationSchema),
};

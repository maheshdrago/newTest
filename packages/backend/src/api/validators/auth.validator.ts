import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../core/errors';

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
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

export const authValidators = {
  register: validate(registerSchema),
  login: validate(loginSchema),
  refreshToken: validate(refreshTokenSchema),
};

import { Router, Request, Response } from 'express';
import { authService } from '../../services/auth';
import { validate } from '../middlewares/validate';
import { loginSchema, registerSchema, refreshTokenSchema } from '../validators/auth';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { authRateLimiter } from '../../patterns/rate-limiter';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  const result = await authService.register(name, email, password);
  res.status(201).json({ success: true, data: result });
});

router.post('/login', authRateLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.json({ success: true, data: result });
});

router.post('/refresh', validate(refreshTokenSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const tokens = await authService.refreshToken(refreshToken);
  res.json({ success: true, data: { tokens } });
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = await authService.getUserById(authReq.userId);
  res.json({ success: true, data: { user } });
});

export default router;

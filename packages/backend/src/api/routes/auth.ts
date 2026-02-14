import { Router, Request, Response } from 'express';
import { authService } from '../../services/auth';
import { validate } from '../middlewares/validate';
import { loginSchema, registerSchema, refreshTokenSchema } from '../validators/auth';
import { authenticate, AuthenticatedRequest } from '../middlewares/auth';
import { authRateLimiter } from '../../patterns/rate-limiter';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  const result = await authService.register(name, email, password, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.status(201).json({ success: true, data: result });
});

router.post('/login', authRateLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data: result });
});

router.post('/refresh', validate(refreshTokenSchema), async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const tokens = await authService.refreshToken(refreshToken);
  res.json({ success: true, data: { tokens } });
});

// Logout current session
router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// Logout from all devices
router.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const count = await authService.logoutAll(authReq.userId);
  res.json({ success: true, message: `${count} sessions revoked` });
});

// List active sessions (device management)
router.get('/sessions', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const sessions = await authService.getActiveSessions(authReq.userId);
  res.json({ success: true, data: { sessions } });
});

// Revoke a specific session by ID
router.delete('/sessions/:sessionId', authenticate, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const revoked = await authService.revokeSession(req.params.sessionId, authReq.userId);
  if (!revoked) {
    res.status(404).json({ success: false, message: 'Session not found' });
    return;
  }
  res.json({ success: true, message: 'Session revoked' });
});

export default router;

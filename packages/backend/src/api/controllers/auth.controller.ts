import { Request, Response } from 'express';
import { authService } from '../../services/auth/auth.service';

export class AuthController {
  async register(req: Request, res: Response) {
    const { name, email, password } = req.body;
    const result = await authService.register(name, email, password);
    res.status(201).json({ success: true, data: result });
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json({ success: true, data: result });
  }

  async refreshToken(req: Request, res: Response) {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshToken(refreshToken);
    res.json({ success: true, data: { tokens } });
  }

  async me(req: Request, res: Response) {
    res.json({
      success: true,
      data: {
        userId: req.userId,
        email: req.userEmail,
        role: req.userRole,
      },
    });
  }
}

export const authController = new AuthController();

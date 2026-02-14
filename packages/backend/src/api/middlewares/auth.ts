import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../core/config';
import { AuthenticationError, AuthorizationError } from '../../core/errors';
import { extractBearerToken } from '../../core/utils';

export interface AuthenticatedRequest extends Request {
  userId: string;
  userRole: string;
  userEmail: string;
}

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AuthenticationError('No authentication token provided');
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).userId = decoded.userId;
    (req as AuthenticatedRequest).userRole = decoded.role;
    (req as AuthenticatedRequest).userEmail = decoded.email;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token has expired');
    }
    throw new AuthenticationError('Invalid authentication token');
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!roles.includes(authReq.userRole)) {
      throw new AuthorizationError(`Role '${authReq.userRole}' is not authorized for this resource`);
    }
    next();
  };
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).userId = decoded.userId;
    (req as AuthenticatedRequest).userRole = decoded.role;
    (req as AuthenticatedRequest).userEmail = decoded.email;
  } catch {
    // Token invalid but optional, continue without auth
  }
  next();
}

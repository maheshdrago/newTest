import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';

export function generateRequestId(): string {
  return `req_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function parsePageParams(query: Record<string, unknown>): { page: number; pageSize: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize };
}

export function calculateOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

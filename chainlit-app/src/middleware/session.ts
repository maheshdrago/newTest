// ─────────────────────────────────────────────────────────────
//  Session middleware — reads/creates a session cookie so that
//  both HTTP and WebSocket connections can share a session.
// ─────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import cookie from "cookie";
import type { IncomingMessage } from "http";
import { SessionRepo } from "../db/repositories";
import type { Session } from "../types";

const COOKIE_NAME = "chainlit_sid";

/** Express middleware that attaches `req.session` */
export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const cookies = cookie.parse(req.headers.cookie ?? "");
  let session: Session | undefined;

  if (cookies[COOKIE_NAME]) {
    session = SessionRepo.findById(cookies[COOKIE_NAME]);
  }

  if (!session) {
    session = SessionRepo.create();
  } else {
    // Extend TTL on every request
    SessionRepo.refresh(session.id);
  }

  // Attach to request for downstream handlers
  (req as RequestWithSession).session = session;
  next();
}

/** Set the session cookie on a response */
export function setSessionCookie(res: Response, sessionId: string): void {
  res.setHeader(
    "Set-Cookie",
    cookie.serialize(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 72 * 3600, // 72 hours
    })
  );
}

/** Extract session from a raw WS upgrade request */
export function sessionFromUpgrade(req: IncomingMessage): Session {
  const cookies = cookie.parse(req.headers.cookie ?? "");
  let session: Session | undefined;

  if (cookies[COOKIE_NAME]) {
    session = SessionRepo.findById(cookies[COOKIE_NAME]);
  }

  if (!session) {
    session = SessionRepo.create();
  } else {
    SessionRepo.refresh(session.id);
  }

  return session;
}

/** Augmented Express Request */
export interface RequestWithSession extends Request {
  session: Session;
}

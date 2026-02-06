// ─────────────────────────────────────────────────────────────
//  HTTP routes — serves the SPA + a lightweight health API
// ─────────────────────────────────────────────────────────────

import { Router } from "express";
import path from "path";
import { setSessionCookie, type RequestWithSession } from "../middleware/session";

const router = Router();

/** Health check endpoint for load balancers / Docker */
router.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/** Session info endpoint — also sets the cookie if new */
router.get("/api/session", (req, res) => {
  const session = (req as RequestWithSession).session;
  setSessionCookie(res, session.id);
  res.json({ sessionId: session.id, expiresAt: session.expiresAt });
});

/** Serve the SPA for all other routes */
router.get("*", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

export { router };

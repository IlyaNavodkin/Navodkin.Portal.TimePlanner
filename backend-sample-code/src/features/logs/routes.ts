import { Router } from "express";
import { AppError } from "../../shared/errors.js";
import { ERROR_CODES } from "../../shared/error-codes.js";
import { optionalAuth } from "../../shared/middleware/auth.js";
import { db } from "../../shared/db/database.js";
import type { AppLogLevel } from "../../shared/db/types.js";

const router = Router();
const ALLOWED_LEVELS = new Set(["debug", "info", "warn", "error"]);

interface IncomingLog {
  ts?: unknown;
  level?: unknown;
  scope?: unknown;
  message?: unknown;
  meta?: unknown;
}

router.post("/api/logs/batch", optionalAuth, async (req, res, next) => {
  try {
    const body = req.body as { logs?: IncomingLog[] };
    const logs = Array.isArray(body?.logs) ? body.logs : [];
    if (logs.length === 0) {
      res.status(204).end();
      return;
    }
    if (logs.length > 200) {
      throw new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "Too many log entries in one batch",
      });
    }

    const now = Date.now();
    const rows = logs
      .map((entry) => {
        const rawLevel = typeof entry.level === "string" ? entry.level.toLowerCase() : "";
        const level = (ALLOWED_LEVELS.has(rawLevel) ? rawLevel : null) as AppLogLevel | null;
        const scope = typeof entry.scope === "string" ? entry.scope.trim().slice(0, 120) : "";
        const message = typeof entry.message === "string" ? entry.message.trim().slice(0, 4000) : "";
        if (!level || !scope || !message) return null;

        const rawTs = typeof entry.ts === "string" ? Date.parse(entry.ts) : NaN;
        const createdAt = Number.isFinite(rawTs) ? new Date(rawTs) : new Date(now);
        const meta = entry.meta && typeof entry.meta === "object" ? entry.meta as Record<string, unknown> : null;

        return {
          created_at: createdAt,
          level,
          scope,
          message,
          meta,
          source: "frontend",
          user_id: req.user?.sub ?? null,
          username: req.user?.username ?? null,
          trace_id: null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length > 0) {
      await db.insertInto("app_logs").values(rows).execute();
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;

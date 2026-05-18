import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../logger.js";
import { ensureTraceId, normalizeAppError, toErrorEnvelope } from "../errors.js";

const logger = createLogger("http/error");

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  const appError = normalizeAppError(err);
  const traceId = ensureTraceId(req.headers["x-request-id"]);

  if (appError.status >= 500) {
    logger.error("request failed", {
      method: req.method,
      path: req.originalUrl,
      status: appError.status,
      code: appError.code,
      traceId,
      details: appError.details,
    });
  } else {
    logger.warn("request rejected", {
      method: req.method,
      path: req.originalUrl,
      status: appError.status,
      code: appError.code,
      traceId,
      details: appError.details,
    });
  }

  res.status(appError.status).json(toErrorEnvelope(appError, traceId));
}

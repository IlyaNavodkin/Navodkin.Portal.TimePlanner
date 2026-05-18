import { ERROR_CODES } from "../error-codes.js";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";
import type { JwtPayload } from "../../features/auth/types.js";
import { AppError, getErrorMessage } from "../errors.js";

// Augment Express request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Injectable ban check (set by app bootstrap)
let banCheck: (userId: string) => Promise<boolean> = async () => false;
export function setBanCheck(fn: (userId: string) => Promise<boolean>): void {
  banCheck = fn;
}

// Injectable session validation (set by app bootstrap)
let sessionCheck: (sessionId: string, userId: string) => Promise<boolean> = async () => true;
export function setSessionCheck(fn: (sessionId: string, userId: string) => Promise<boolean>): void {
  sessionCheck = fn;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export async function verifyBearerToken(token: string): Promise<JwtPayload> {
  const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
  if (!payload.jti) {
    throw new Error("Session id is missing");
  }

  const isActive = await sessionCheck(payload.jti, payload.sub);
  if (!isActive) {
    throw new Error("Session is not active");
  }

  const isBanned = await banCheck(payload.sub);
  if (isBanned) {
    throw new Error("User is banned");
  }

  return payload;
}

// Required auth - 401 if no/invalid token
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    next(new AppError({
      status: 401,
      code: ERROR_CODES.AUTH_NO_TOKEN,
      message: "No token provided",
    }));
    return;
  }
  try {
    req.user = await verifyBearerToken(token);
    next();
  } catch (err) {
    const message = getErrorMessage(err);
    if (message.includes("User is banned")) {
      next(new AppError({
        status: 403,
        code: ERROR_CODES.AUTH_BANNED,
        message: "User is banned",
      }));
      return;
    }
    if (message.includes("Session is not active")) {
      next(new AppError({
        status: 401,
        code: ERROR_CODES.AUTH_SESSION_INACTIVE,
        message: "Session is not active",
      }));
      return;
    }
    next(new AppError({
      status: 401,
      code: ERROR_CODES.AUTH_TOKEN_INVALID,
      message: "Invalid or expired token",
    }));
  }
}

// Optional auth - populates req.user if token present, but doesn't block
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await verifyBearerToken(token);
    } catch {
      // ignore invalid token in optional context
    }
  }
  next();
}

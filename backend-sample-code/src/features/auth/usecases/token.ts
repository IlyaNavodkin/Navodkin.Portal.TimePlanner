import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_ACCESS_EXPIRES, JWT_REFRESH_EXPIRES } from "../config.js";
import type { JwtPayload, RefreshJwtPayload } from "../types.js";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function signAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES } as jwt.SignOptions);
}

function signRefreshToken(sessionId: string, userId: string): string {
  const payload: Omit<RefreshJwtPayload, "iat" | "exp"> = {
    sub: userId,
    jti: sessionId,
    typ: "refresh",
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES } as jwt.SignOptions);
}

export function issueTokenPair(payload: Omit<JwtPayload, "iat" | "exp">): TokenPair {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload.jti, payload.sub),
  };
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): RefreshJwtPayload {
  return jwt.verify(token, JWT_SECRET) as RefreshJwtPayload;
}

export function decodeTokenExpMs(token: string): number {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) {
    throw new Error("Token missing exp");
  }
  return decoded.exp * 1000;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

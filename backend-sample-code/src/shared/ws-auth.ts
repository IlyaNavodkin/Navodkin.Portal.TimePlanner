import type { IncomingMessage } from "http";
import type { WebSocket } from "ws";
import { verifyBearerToken } from "./middleware/auth.js";
import type { JwtPayload } from "../features/auth/types.js";

export interface WsSessionMeta {
  userId: string;
  username: string;
  sessionId: string;
  expiresAtMs: number;
}

const sessionBySocket = new Map<WebSocket, WsSessionMeta>();

function clearSocketState(ws: WebSocket): void {
  sessionBySocket.delete(ws);
}

export function bindSocketSession(ws: WebSocket, meta: WsSessionMeta): void {
  clearSocketState(ws);
  sessionBySocket.set(ws, meta);
  ws.on("close", () => clearSocketState(ws));
}

export function getSocketSessionMeta(ws: WebSocket): WsSessionMeta | undefined {
  return sessionBySocket.get(ws);
}

export function closeSocketsBySessionIds(sessionIds: string[], code = 4401, reason = "session-revoked"): void {
  if (sessionIds.length === 0) return;
  const targets = new Set(sessionIds);
  for (const [ws, meta] of sessionBySocket) {
    if (!targets.has(meta.sessionId)) continue;
    if (ws.readyState === ws.OPEN) {
      ws.close(code, reason);
    } else {
      clearSocketState(ws);
    }
  }
}

function extractWsBearerToken(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const tokenFromQuery = url.searchParams.get("token");
  if (tokenFromQuery) return tokenFromQuery;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export interface WsAuthContext {
  payload: JwtPayload;
  sessionMeta: WsSessionMeta;
}

export async function authenticateWsRequest(req: IncomingMessage): Promise<WsAuthContext | null> {
  const token = extractWsBearerToken(req);
  if (!token) return null;

  try {
    const payload = await verifyBearerToken(token);
    const expMs = (payload.exp ?? 0) * 1000;
    if (!payload.jti || !payload.exp) return null;
    return {
      payload,
      sessionMeta: {
        userId: payload.sub,
        username: payload.username,
        sessionId: payload.jti,
        expiresAtMs: expMs,
      },
    };
  } catch {
    return null;
  }
}

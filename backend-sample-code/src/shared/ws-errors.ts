import { randomUUID } from "crypto";
import type { WebSocket } from "ws";

export interface WsErrorPayload {
  type: "error";
  code: string;
  message: string;
  details?: unknown;
  traceId: string;
}

export function sendWsError(
  ws: WebSocket,
  params: { code: string; message: string; details?: unknown; traceId?: string },
): void {
  if (ws.readyState !== ws.OPEN) return;
  const payload: WsErrorPayload = {
    type: "error",
    code: params.code,
    message: params.message,
    ...(params.details !== undefined ? { details: params.details } : {}),
    traceId: params.traceId ?? randomUUID(),
  };
  ws.send(JSON.stringify(payload));
}

import { ERROR_CODES } from "../../../shared/error-codes.js";
import { WebSocketServer, WebSocket } from "ws";
import { authUseCase } from "../usecases/AuthUseCase.js";
import { WS_AUTH } from "../ws-events.js";
import { getSocketSessionMeta, closeSocketsBySessionIds } from "../../../shared/ws-auth.js";
import { sendWsError } from "../../../shared/ws-errors.js";

const REFRESH_WINDOW_MS = 120_000;

function send(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function handlePing(ws: WebSocket, msg: { accessExpMs?: number }): Promise<void> {
  const session = getSocketSessionMeta(ws);
  if (!session) return;

  const isActive = await authUseCase.isSessionActive(session.sessionId, session.userId);
  if (!isActive) {
    send(ws, { type: WS_AUTH.LOGOUT_REQUIRED, reason: "session_inactive" });
    closeSocketsBySessionIds([session.sessionId], 4401, "session-inactive");
    return;
  }

  const accessExpMs = typeof msg.accessExpMs === "number" ? msg.accessExpMs : 0;
  if (accessExpMs > 0 && accessExpMs - Date.now() <= REFRESH_WINDOW_MS) {
    send(ws, { type: WS_AUTH.REFRESH_REQUIRED });
  }

  send(ws, { type: WS_AUTH.PONG, serverTime: Date.now() });
}

export function setupAuthWss(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendWsError(ws, {
          code: ERROR_CODES.WS_INVALID_PAYLOAD,
          message: "Invalid JSON payload",
        });
        return;
      }

      if (msg?.type === WS_AUTH.PING) {
        void handlePing(ws, msg as { accessExpMs?: number });
      } else {
        sendWsError(ws, {
          code: ERROR_CODES.WS_UNSUPPORTED_TYPE,
          message: "Unsupported message type",
          details: { type: msg?.type },
        });
      }
    });
  });
}

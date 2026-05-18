import { ERROR_CODES } from "../../../shared/error-codes.js";
import { WebSocketServer, WebSocket } from "ws";
import { WS_CHAT } from "../ws-events.js";
import { getSocketSessionMeta } from "../../../shared/ws-auth.js";
import { sendWsError } from "../../../shared/ws-errors.js";

interface ChatClient {
  identity: string;
  roomId: string;
}

interface ChatMessage {
  id: string;
  senderIdentity: string;
  text: string;
  timestamp: number;
}

interface FileMeta {
  id: string;
  senderIdentity: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
}

const clients = new Map<WebSocket, ChatClient>();
const roomHistory = new Map<string, ChatMessage[]>();

const MAX_HISTORY = 200;

function getRoomHistory(roomId: string): ChatMessage[] {
  if (!roomHistory.has(roomId)) roomHistory.set(roomId, []);
  return roomHistory.get(roomId)!;
}

function sendTo(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastToRoom(roomId: string, payload: object, exclude?: WebSocket): void {
  const msg = JSON.stringify(payload);
  for (const [ws, client] of clients) {
    if (client.roomId === roomId && ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function removeClient(ws: WebSocket): void {
  clients.delete(ws);
}

export function setupChatWss(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendWsError(ws, {
          code: ERROR_CODES.WS_INVALID_PAYLOAD,
          message: "Invalid chat websocket payload",
        });
        return;
      }

      switch (msg.type) {
        case WS_CHAT.JOIN: {
          if (typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_INVALID_JOIN,
              message: "roomId is required",
            });
            return;
          }
          const session = getSocketSessionMeta(ws);
          if (!session) {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_UNAUTHORIZED,
              message: "Authentication required",
            });
            return;
          }
          removeClient(ws);
          clients.set(ws, { identity: session.username, roomId: msg.roomId });

          const history = getRoomHistory(msg.roomId);
          if (history.length > 0) {
            sendTo(ws, { type: WS_CHAT.HISTORY, messages: history });
          }
          break;
        }

        case WS_CHAT.MESSAGE: {
          const info = clients.get(ws);
          if (!info) {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_NOT_JOINED,
              message: "Join chat room before sending messages",
            });
            return;
          }
          if (typeof msg.id !== "string" || typeof msg.text !== "string" || msg.text.trim() === "") {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_INVALID_MESSAGE,
              message: "id and text are required",
            });
            return;
          }
          const chatMsg: ChatMessage = {
            id: msg.id,
            senderIdentity: info.identity,
            text: msg.text,
            timestamp: msg.timestamp ?? Date.now(),
          };
          const history = getRoomHistory(info.roomId);
          history.push(chatMsg);
          if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

          broadcastToRoom(info.roomId, { type: WS_CHAT.REMOTE_MESSAGE, ...chatMsg }, ws);
          break;
        }

        case WS_CHAT.FILE_META: {
          const info = clients.get(ws);
          if (!info) {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_NOT_JOINED,
              message: "Join chat room before sharing files",
            });
            return;
          }
          if (typeof msg.id !== "string" || typeof msg.fileName !== "string" || msg.fileName.trim() === "") {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_INVALID_FILE_META,
              message: "id and fileName are required",
            });
            return;
          }
          broadcastToRoom(info.roomId, {
            type: WS_CHAT.REMOTE_FILE_META,
            id: msg.id,
            senderIdentity: info.identity,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            mimeType: msg.mimeType,
            totalChunks: msg.totalChunks,
          }, ws);
          break;
        }

        case WS_CHAT.FILE_CHUNK: {
          const info = clients.get(ws);
          if (!info) {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_NOT_JOINED,
              message: "Join chat room before uploading file chunks",
            });
            return;
          }
          if (typeof msg.id !== "string") {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_INVALID_FILE_CHUNK,
              message: "id is required",
            });
            return;
          }
          broadcastToRoom(info.roomId, {
            type: WS_CHAT.REMOTE_FILE_CHUNK,
            id: msg.id,
            index: msg.index,
            data: msg.data,
          }, ws);
          break;
        }

        case WS_CHAT.FILE_END: {
          const info = clients.get(ws);
          if (!info) {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_NOT_JOINED,
              message: "Join chat room before finalizing file upload",
            });
            return;
          }
          if (typeof msg.id !== "string") {
            sendWsError(ws, {
              code: ERROR_CODES.CHAT_INVALID_FILE_END,
              message: "id is required",
            });
            return;
          }
          broadcastToRoom(info.roomId, {
            type: WS_CHAT.REMOTE_FILE_END,
            id: msg.id,
          }, ws);
          break;
        }

        default:
          sendWsError(ws, {
            code: ERROR_CODES.WS_UNSUPPORTED_TYPE,
            message: "Unsupported chat message type",
            details: { type: msg?.type },
          });
      }
    });

    ws.on("close", () => removeClient(ws));
  });
}

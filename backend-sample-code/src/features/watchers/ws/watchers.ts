import { ERROR_CODES } from "../../../shared/error-codes.js";
import { WebSocketServer, WebSocket } from "ws";
import type { WatcherClients, WatcherRooms } from "../types.js";
import { WS_WATCHER } from "../ws-events.js";
import { getSocketSessionMeta } from "../../../shared/ws-auth.js";
import { sendWsError } from "../../../shared/ws-errors.js";

const watcherClients: WatcherClients = new Map();
const watcherRooms: WatcherRooms = new Map();

function broadcastWatcherList(streamKey: string): void {
  const room = watcherRooms.get(streamKey);
  if (!room) return;
  const watchers: string[] = [];
  for (const ws of room) {
    const info = watcherClients.get(ws);
    if (info) watchers.push(info.identity);
  }
  const msg = JSON.stringify({ type: WS_WATCHER.LIST, streamKey, watchers });
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
  console.log(`[watchers] list (${watchers.length}) in stream ${streamKey}:`, watchers);
}

function removeClient(ws: WebSocket): void {
  const info = watcherClients.get(ws);
  if (!info) return;
  const room = watcherRooms.get(info.streamKey);
  if (room) {
    room.delete(ws);
    if (room.size === 0) {
      watcherRooms.delete(info.streamKey);
    } else {
      broadcastWatcherList(info.streamKey);
    }
  }
  watcherClients.delete(ws);
  console.log(`[watchers] removed ${info.identity} from ${info.streamKey}`);
}

export function setupWatchersWss(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    console.log("[watchers] ws connected");

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendWsError(ws, {
          code: ERROR_CODES.WS_INVALID_PAYLOAD,
          message: "Invalid watchers websocket payload",
        });
        return;
      }

      if (msg.type === WS_WATCHER.WATCH) {
        if (typeof msg.streamKey !== "string" || msg.streamKey.trim() === "") {
          sendWsError(ws, {
            code: ERROR_CODES.WATCHER_INVALID_WATCH,
            message: "streamKey is required",
          });
          return;
        }
        const session = getSocketSessionMeta(ws);
        if (!session) {
          sendWsError(ws, {
            code: ERROR_CODES.WATCHER_UNAUTHORIZED,
            message: "Authentication required",
          });
          return;
        }
        // Leave previous stream if switching
        removeClient(ws);

        watcherClients.set(ws, { identity: session.username, streamKey: msg.streamKey });
        if (!watcherRooms.has(msg.streamKey)) watcherRooms.set(msg.streamKey, new Set());
        watcherRooms.get(msg.streamKey)!.add(ws);
        broadcastWatcherList(msg.streamKey);
        console.log(`[watchers] ${session.username} watching ${msg.streamKey}`);
        return;
      }

      if (msg.type === WS_WATCHER.UNWATCH) {
        removeClient(ws);
        return;
      }

      sendWsError(ws, {
        code: ERROR_CODES.WS_UNSUPPORTED_TYPE,
        message: "Unsupported watcher message type",
        details: { type: msg?.type },
      });
    });

    ws.on("close", () => removeClient(ws));
  });
}

import { ERROR_CODES } from "../../../shared/error-codes.js";
import { WebSocketServer, WebSocket } from "ws";
import type { PresenceClients, RoomMetaMap } from "../types.js";
import { WS_PRESENCE } from "../ws-events.js";
import { getSocketSessionMeta } from "../../../shared/ws-auth.js";
import { sendWsError } from "../../../shared/ws-errors.js";

const clients: PresenceClients = new Map();
const roomMeta: RoomMetaMap = new Map();
const avatarVersions: Record<string, number> = {};

function broadcast(payload: object): void {
  const message = JSON.stringify(payload);
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

export function broadcastAvatarUpdated(identity: string): void {
  const version = Date.now();
  avatarVersions[identity] = version;
  broadcast({ type: WS_PRESENCE.AVATAR_UPDATED, identity, version });
}

function broadcastUserList(): void {
  const users = Array.from(clients.values()).map(({ identity, room }) => ({
    identity,
    room,
  }));
  const meta = Object.fromEntries(roomMeta);
  broadcast({ type: WS_PRESENCE.USER_LIST, users, roomMeta: meta });
}

export function setupPresenceWss(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    console.log("[presence] connection");

    ws.on("message", (raw) => {
      console.log("[presence] message", raw.toString());
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendWsError(ws, {
          code: ERROR_CODES.WS_INVALID_PAYLOAD,
          message: "Invalid presence websocket payload",
        });
        return;
      }

      if (msg.type === WS_PRESENCE.CONNECTED) {
        const session = getSocketSessionMeta(ws);
        if (!session) {
          sendWsError(ws, {
            code: ERROR_CODES.PRESENCE_UNAUTHORIZED,
            message: "Authentication required",
          });
          return;
        }
        clients.set(ws, { identity: session.username, room: null });
        broadcastUserList();
        if (Object.keys(avatarVersions).length > 0) {
          ws.send(JSON.stringify({ type: WS_PRESENCE.AVATAR_VERSIONS, versions: avatarVersions }));
        }
        return;
      }

      if (msg.type === WS_PRESENCE.JOIN) {
        if (typeof msg.room !== "string" || msg.room.trim() === "") {
          sendWsError(ws, {
            code: ERROR_CODES.PRESENCE_INVALID_JOIN,
            message: "room is required",
          });
          return;
        }
        const client = clients.get(ws);
        if (!client) {
          sendWsError(ws, {
            code: ERROR_CODES.PRESENCE_NOT_CONNECTED,
            message: "Send presence:connected first",
          });
          return;
        }
        client.room = msg.room;
        broadcastUserList();
        return;
      }

      if (msg.type === WS_PRESENCE.ROOM_META) {
        if (
          typeof msg.room !== "string" ||
          typeof msg.icon !== "string" ||
          typeof msg.color !== "string"
        ) {
          sendWsError(ws, {
            code: ERROR_CODES.PRESENCE_INVALID_ROOM_META,
            message: "room, icon and color are required",
          });
          return;
        }
        if (!roomMeta.has(msg.room)) {
          roomMeta.set(msg.room, { icon: msg.icon, color: msg.color });
          broadcastUserList();
        }
        return;
      }

      if (msg.type === WS_PRESENCE.UNJOIN) {
        const client = clients.get(ws);
        if (!client) {
          sendWsError(ws, {
            code: ERROR_CODES.PRESENCE_NOT_CONNECTED,
            message: "Send presence:connected first",
          });
          return;
        }
        client.room = null;
        broadcastUserList();
        return;
      }

      sendWsError(ws, {
        code: ERROR_CODES.WS_UNSUPPORTED_TYPE,
        message: "Unsupported presence message type",
        details: { type: msg?.type },
      });
    });

    ws.on("close", () => {
      clients.delete(ws);
      broadcastUserList();
    });
  });
}

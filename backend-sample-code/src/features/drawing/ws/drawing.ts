import { ERROR_CODES } from "../../../shared/error-codes.js";
import { WebSocketServer, WebSocket } from "ws";
import type { DrawClients, DrawRooms, DrawSessions, DrawClient } from "../types.js";
import { roomsReadCtx as readCtx } from "../../rooms/data/index.js";
import { WS_DRAW } from "../ws-events.js";
import { sendWsError } from "../../../shared/ws-errors.js";

const DRAW_COLOR_PALETTE = [
  "#3b82f6", // blue
  "#23a559", // green
  "#a855f7", // purple
  "#f97316", // orange
  "#ebcb44", // yellow
  "#894040", // brand red
];

const drawClients: DrawClients = new Map();
const drawRooms: DrawRooms = new Map();
const drawSessions: DrawSessions = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────────

function relayDraw(senderWs: WebSocket, roomId: string, payload: Record<string, unknown>): void {
  const room = drawRooms.get(roomId);
  if (!room) return;
  const message = JSON.stringify(payload);
  let sent = 0;
  for (const ws of room) {
    if (ws !== senderWs && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sent++;
    }
  }
  if (payload.type !== WS_DRAW.REMOTE_CURSOR) {
    console.log(`[draw] relay ${payload.type} → ${sent} clients (room ${roomId})`);
  }
}

function broadcastDrawUsers(roomId: string): void {
  const room = drawRooms.get(roomId);
  if (!room) return;
  const users: { clientId: string; identity: string; color: string }[] = [];
  for (const ws of room) {
    const info = drawClients.get(ws);
    if (info) users.push({ clientId: info.clientId, identity: info.identity, color: info.color });
  }
  const message = JSON.stringify({ type: WS_DRAW.USERS, users });
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
  console.log(`[draw] draw_users (${users.length}) in room ${roomId}`);
}

function removeDrawClient(ws: WebSocket): void {
  const info = drawClients.get(ws);
  if (!info) return;
  console.log(`[draw] disconnect: ${info.identity} from room ${info.roomId}`);
  const room = drawRooms.get(info.roomId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) {
      drawRooms.delete(info.roomId);
    } else {
      const removedMsg = JSON.stringify({ type: WS_DRAW.CURSOR_REMOVED, clientId: info.clientId });
      for (const c of room) {
        if (c.readyState === WebSocket.OPEN) c.send(removedMsg);
      }
      broadcastDrawUsers(info.roomId);
    }
  }
  drawClients.delete(ws);
}

function sendStrokeHistory(ws: WebSocket, roomId: string): void {
  const session = drawSessions.get(roomId);
  if (!session || session.strokes.length === 0) return;
  ws.send(JSON.stringify({ type: WS_DRAW.STROKE_HISTORY, strokes: session.strokes }));
  console.log(`[draw] sent stroke_history (${session.strokes.length}) to client in room ${roomId}`);
}

// ── Permission check ─────────────────────────────────────────────────────────

// drawRoomId format: "${identity}#${participantSid}#${roomName}"
function parseRoomNameFromDrawRoomId(drawRoomId: string): string {
  const parts = drawRoomId.split("#");
  return parts.length >= 3 ? parts.slice(2).join("#") : drawRoomId;
}

async function hasDrawingPermission(info: DrawClient): Promise<boolean> {
  const roomName = parseRoomNameFromDrawRoomId(info.roomId);
  // If roomId doesn't contain '#', it's not a valid draw room id (e.g. a raw trackSid fallback)
  if (!info.roomId.includes("#")) return false;
  const room = await readCtx.getRoomByName(roomName);
  if (!room) return false;
  const participants = await readCtx.getRoomParticipants(room.id);
  const participant = participants.find(p => p.username === info.identity);
  if (!participant) return true;
  return participant.permissions.canDrawing;
}

// ── Message handlers ────────────────────────────────────────────────────────

function handleCreateSession(ws: WebSocket, msg: any): void {
  if (typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
    sendWsError(ws, {
      code: ERROR_CODES.DRAW_INVALID_CREATE_SESSION,
      message: "roomId is required",
    });
    return;
  }
  if (!drawSessions.has(msg.roomId)) {
    drawSessions.set(msg.roomId, {
      strokes: [],
      createdBy: msg.identity || "unknown",
      colorIndex: 0,
    });
    console.log(`[draw] SESSION CREATED ${msg.roomId} by ${msg.identity}`);
  }
}

function handleDestroySession(ws: WebSocket, msg: any): void {
  if (typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
    sendWsError(ws, {
      code: ERROR_CODES.DRAW_INVALID_DESTROY_SESSION,
      message: "roomId is required",
    });
    return;
  }
  drawSessions.delete(msg.roomId);
  const room = drawRooms.get(msg.roomId);
  if (room) {
    const kickMsg = JSON.stringify({ type: WS_DRAW.SESSION_ENDED });
    for (const c of room) {
      if (c.readyState === WebSocket.OPEN) c.send(kickMsg);
    }
  }
  drawRooms.delete(msg.roomId);
  console.log(`[draw] SESSION DESTROYED ${msg.roomId}`);
}

function handleJoinDraw(ws: WebSocket, msg: any): void {
  if (
    typeof msg.roomId !== "string" ||
    msg.roomId.trim() === "" ||
    typeof msg.identity !== "string" ||
    msg.identity.trim() === ""
  ) {
    sendWsError(ws, {
      code: ERROR_CODES.DRAW_INVALID_JOIN,
      message: "roomId and identity are required",
    });
    return;
  }

  removeDrawClient(ws);
  const clientId: string = msg.clientId || msg.identity;

  // Auto-create session if it doesn't exist
  if (!drawSessions.has(msg.roomId)) {
    drawSessions.set(msg.roomId, {
      strokes: [],
      createdBy: msg.identity,
      colorIndex: 0,
    });
  }
  const session = drawSessions.get(msg.roomId)!;

  // Assign color by join order, cycling through palette
  const color = DRAW_COLOR_PALETTE[session.colorIndex % DRAW_COLOR_PALETTE.length];
  session.colorIndex++;

  drawClients.set(ws, { clientId, identity: msg.identity, roomId: msg.roomId, color });
  if (!drawRooms.has(msg.roomId)) drawRooms.set(msg.roomId, new Set());
  drawRooms.get(msg.roomId)!.add(ws);

  // Tell the joining client their assigned color
  console.log(`[draw] draw_welcome → identity="${msg.identity}" clientId="${clientId}" assignedColor="${color}"`);
  ws.send(JSON.stringify({ type: WS_DRAW.WELCOME, color }));

  sendStrokeHistory(ws, msg.roomId);
  broadcastDrawUsers(msg.roomId);
  console.log(
    `[draw] ${msg.identity} JOINED ${msg.roomId} color=${color} (${drawRooms.get(msg.roomId)!.size} clients)`,
  );
}

async function handleDrawingMessage(ws: WebSocket, msg: any): Promise<void> {
  const info = drawClients.get(ws);
  if (!info) {
    sendWsError(ws, {
      code: ERROR_CODES.DRAW_NOT_JOINED,
      message: "Join drawing room before sending draw events",
    });
    return;
  }

  const { roomId } = info;
  const session = drawSessions.get(roomId);

  switch (msg.type) {
    case WS_DRAW.CURSOR_MOVE:
      console.log(`[draw] cursor_move from identity="${info.identity}" clientId="${info.clientId}" color="${info.color}" tool="${msg.tool}"`);
      relayDraw(ws, roomId, {
        type: WS_DRAW.REMOTE_CURSOR,
        clientId: info.clientId,
        identity: info.identity,
        x: msg.x,
        y: msg.y,
        tool: msg.tool,
        color: info.color,
      });
      break;

    case WS_DRAW.STROKE_PREVIEW:
      relayDraw(ws, roomId, {
        type: WS_DRAW.REMOTE_STROKE_PREVIEW,
        clientId: info.clientId,
        identity: info.identity,
        id: msg.id,
        tool: msg.tool,
        color: msg.color,
        width: msg.width,
        points: msg.points,
      });
      break;

    case WS_DRAW.STROKE:
      if (!await hasDrawingPermission(info)) {
        sendWsError(ws, {
          code: ERROR_CODES.DRAW_FORBIDDEN,
          message: "No permission to draw in this room",
          details: { roomId },
        });
        return;
      }
      if (session && Array.isArray(msg.points) && msg.points.length >= 2) {
        session.strokes.push({
          id: msg.id,
          tool: msg.tool,
          color: msg.color,
          width: msg.width,
          points: msg.points,
          identity: info.identity,
          clientId: info.clientId,
        });
      }
      relayDraw(ws, roomId, {
        type: WS_DRAW.REMOTE_STROKE,
        clientId: info.clientId,
        identity: info.identity,
        id: msg.id,
        tool: msg.tool,
        color: msg.color,
        width: msg.width,
        points: msg.points,
      });
      break;

    case WS_DRAW.ERASE:
      if (!await hasDrawingPermission(info)) {
        sendWsError(ws, {
          code: ERROR_CODES.DRAW_FORBIDDEN,
          message: "No permission to erase in this room",
          details: { roomId },
        });
        return;
      }
      if (session && Array.isArray(msg.strokeIds)) {
        const idsToRemove = new Set(msg.strokeIds);
        session.strokes = session.strokes.filter((s) => !idsToRemove.has(s.id));
      }
      relayDraw(ws, roomId, {
        type: WS_DRAW.REMOTE_ERASE,
        clientId: info.clientId,
        identity: info.identity,
        strokeIds: msg.strokeIds,
      });
      break;

    case WS_DRAW.CLEAR_OWN:
      if (!await hasDrawingPermission(info)) {
        sendWsError(ws, {
          code: ERROR_CODES.DRAW_FORBIDDEN,
          message: "No permission to clear drawings in this room",
          details: { roomId },
        });
        return;
      }
      if (session) {
        session.strokes = session.strokes.filter((s) => s.clientId !== info.clientId);
      }
      relayDraw(ws, roomId, {
        type: WS_DRAW.REMOTE_CLEAR,
        clientId: info.clientId,
        identity: info.identity,
      });
      break;

    default:
      sendWsError(ws, {
        code: ERROR_CODES.WS_UNSUPPORTED_TYPE,
        message: "Unsupported drawing message type",
        details: { type: msg?.type },
      });
  }
}

// ── Setup ───────────────────────────────────────────────────────────────────

export function setupDrawingWss(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    console.log("[draw] ws connected");

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendWsError(ws, {
          code: ERROR_CODES.WS_INVALID_PAYLOAD,
          message: "Invalid drawing websocket payload",
        });
        return;
      }

      switch (msg.type) {
        case WS_DRAW.CREATE_SESSION:
          handleCreateSession(ws, msg);
          return;
        case WS_DRAW.DESTROY_SESSION:
          handleDestroySession(ws, msg);
          return;
        case WS_DRAW.JOIN:
          handleJoinDraw(ws, msg);
          return;
        case WS_DRAW.LEAVE:
          removeDrawClient(ws);
          return;
        default:
          void handleDrawingMessage(ws, msg).catch(() => {
            sendWsError(ws, {
              code: ERROR_CODES.DRAW_MESSAGE_ERROR,
              message: "Failed to process drawing message",
            });
          });
      }
    });

    ws.on("close", () => removeDrawClient(ws));
  });
}

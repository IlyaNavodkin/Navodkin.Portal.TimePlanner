import { ERROR_CODES } from "../../../shared/error-codes.js";
import { WebSocketServer, WebSocket } from "ws";
import { WS_RADIO } from "../ws-events.js";
import { roomsReadCtx } from "../../rooms/data/index.js";
import { authReadCtx } from "../../auth/data/index.js";
import type { IncomingMessage } from "http";
import { getSocketSessionMeta } from "../../../shared/ws-auth.js";
import { sendWsError } from "../../../shared/ws-errors.js";
import fs from "fs";
import path from "path";
import { RADIO_DIR } from "../config.js";

interface RadioState {
  trackId: string | null;
  isPlaying: boolean;
  positionMs: number;
  updatedAt: number;
  queue: string[];
}

interface RadioClient {
  roomId: string;
  canListenRadio: boolean;
  canManageRadio: boolean;
}

const radioClients = new Map<WebSocket, RadioClient>();
const radioStateByRoom = new Map<string, RadioState>();

function makeEmptyRadioState(): RadioState {
  return {
    trackId: null,
    isPlaying: false,
    positionMs: 0,
    updatedAt: Date.now(),
    queue: [],
  };
}

function getRoomState(roomId: string): RadioState {
  const state = radioStateByRoom.get(roomId);
  if (state) return state;
  const initialState = makeEmptyRadioState();
  radioStateByRoom.set(roomId, initialState);
  return initialState;
}

function setRoomState(roomId: string, state: RadioState): void {
  radioStateByRoom.set(roomId, state);
}

function broadcast(payload: object): void {
  const msg = JSON.stringify({ ...payload, serverTime: Date.now() });
  for (const ws of radioClients.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function broadcastRoomState(roomId: string): void {
  const state = getRoomState(roomId);
  const msg = JSON.stringify({ type: WS_RADIO.STATE, ...state, serverTime: Date.now() });
  for (const [ws, client] of radioClients.entries()) {
    if (client.roomId !== roomId) continue;
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

export function broadcastTracksUpdated(): void {
  broadcast({ type: WS_RADIO.TRACKS_UPDATED });
}

function safeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((x): x is string => typeof x === "string");
}

function trackExists(trackId: string): boolean {
  const filePath = path.join(RADIO_DIR, path.basename(trackId));
  return fs.existsSync(filePath);
}

function getFirstExistingTrack(trackIds: string[]): string | null {
  for (const trackId of trackIds) {
    if (trackExists(trackId)) return trackId;
  }
  return null;
}

export function removeTrackFromRadioState(trackId: string): void {
  const normalizedTrackId = path.basename(trackId);
  for (const [roomId, state] of radioStateByRoom.entries()) {
    const filteredQueue = state.queue.filter((id) => id !== normalizedTrackId);
    const removedCurrentTrack = state.trackId === normalizedTrackId;
    let nextTrackId = state.trackId;
    let nextIsPlaying = state.isPlaying;

    if (removedCurrentTrack) {
      nextTrackId = getFirstExistingTrack(filteredQueue);
      nextIsPlaying = nextTrackId !== null;
    }

    const changed =
      filteredQueue.length !== state.queue.length ||
      nextTrackId !== state.trackId ||
      nextIsPlaying !== state.isPlaying;

    if (!changed) continue;

    setRoomState(roomId, {
      ...state,
      trackId: nextTrackId,
      isPlaying: nextIsPlaying,
      positionMs: 0,
      updatedAt: Date.now(),
      queue: filteredQueue,
    });
    broadcastRoomState(roomId);
  }
}

async function getRadioAccess(req: IncomingMessage, ws: WebSocket): Promise<RadioClient> {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const roomId = url.searchParams.get("roomId");
    const userId = getSocketSessionMeta(ws)?.userId;

    if (!roomId || !userId) {
      return { roomId: "", canListenRadio: false, canManageRadio: false };
    }

    const [requesterUser, room, participants] = await Promise.all([
      authReadCtx.getUserById(userId),
      roomsReadCtx.getRoomById(roomId),
      roomsReadCtx.getRoomParticipants(roomId),
    ]);

    if (!requesterUser || !room) {
      return { roomId, canListenRadio: false, canManageRadio: false };
    }
    if (requesterUser.roleName === "admin" || room.createdBy === userId) {
      return { roomId, canListenRadio: true, canManageRadio: true };
    }

    const requesterParticipant = participants.find((participant) => participant.id === userId);
    return {
      roomId,
      canListenRadio: requesterParticipant?.permissions.canListenRadio ?? false,
      canManageRadio: requesterParticipant?.permissions.canManageRadio ?? false,
    };
  } catch {
    return { roomId: "", canListenRadio: false, canManageRadio: false };
  }
}

function isControlMessage(type: unknown): boolean {
  return (
    type === WS_RADIO.TRACK ||
    type === WS_RADIO.PLAY ||
    type === WS_RADIO.PAUSE ||
    type === WS_RADIO.SEEK ||
    type === WS_RADIO.QUEUE_SET
  );
}

export function setupRadioWss(wss: WebSocketServer): void {
  wss.on("connection", async (ws, req) => {
    const access = await getRadioAccess(req, ws);
    if (!access.canListenRadio) {
      sendWsError(ws, {
        code: ERROR_CODES.RADIO_FORBIDDEN,
        message: "Not authorized to listen radio",
      });
      ws.close(1008, "Not authorized to listen radio");
      return;
    }

    radioClients.set(ws, access);
    ws.send(JSON.stringify({ type: WS_RADIO.STATE, ...getRoomState(access.roomId), serverTime: Date.now() }));

    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendWsError(ws, {
          code: ERROR_CODES.WS_INVALID_PAYLOAD,
          message: "Invalid radio websocket payload",
        });
        return;
      }
      const client = radioClients.get(ws);
      if (!client) {
        sendWsError(ws, {
          code: ERROR_CODES.RADIO_CLIENT_NOT_READY,
          message: "Radio client is not initialized",
        });
        return;
      }
      if (isControlMessage(msg.type) && !client.canManageRadio) {
        sendWsError(ws, {
          code: ERROR_CODES.RADIO_FORBIDDEN,
          message: "Not authorized to control radio",
          details: { type: msg?.type },
        });
        return;
      }

      if (msg.type === WS_RADIO.TRACK && typeof msg.trackId === "string") {
        const nextTrackId = path.basename(msg.trackId);
        if (!trackExists(nextTrackId)) {
          sendWsError(ws, {
            code: ERROR_CODES.RADIO_INVALID_TRACK,
            message: "Track does not exist",
          });
          return;
        }
        const roomState = getRoomState(client.roomId);
        setRoomState(client.roomId, {
          ...roomState,
          trackId: nextTrackId,
          isPlaying: true,
          positionMs: 0,
          updatedAt: Date.now(),
          // optionally update queue atomically when advancing from queue
          ...(msg.queue !== undefined && { queue: safeStringArray(msg.queue) }),
        });
        broadcastRoomState(client.roomId);
      } else if (msg.type === WS_RADIO.TRACK) {
        sendWsError(ws, {
          code: ERROR_CODES.RADIO_INVALID_TRACK,
          message: "trackId must be a string",
        });
      } else if (msg.type === WS_RADIO.PLAY) {
        const roomState = getRoomState(client.roomId);
        setRoomState(client.roomId, { ...roomState, isPlaying: true, updatedAt: Date.now() });
        broadcastRoomState(client.roomId);
      } else if (
        msg.type === WS_RADIO.PAUSE &&
        typeof msg.positionMs === "number"
      ) {
        const roomState = getRoomState(client.roomId);
        setRoomState(client.roomId, {
          ...roomState,
          isPlaying: false,
          positionMs: msg.positionMs,
          updatedAt: Date.now(),
        });
        broadcastRoomState(client.roomId);
      } else if (msg.type === WS_RADIO.PAUSE) {
        sendWsError(ws, {
          code: ERROR_CODES.RADIO_INVALID_PAUSE,
          message: "positionMs must be a number",
        });
      } else if (
        msg.type === WS_RADIO.SEEK &&
        typeof msg.positionMs === "number"
      ) {
        const roomState = getRoomState(client.roomId);
        setRoomState(client.roomId, {
          ...roomState,
          positionMs: msg.positionMs,
          updatedAt: Date.now(),
        });
        broadcastRoomState(client.roomId);
      } else if (msg.type === WS_RADIO.SEEK) {
        sendWsError(ws, {
          code: ERROR_CODES.RADIO_INVALID_SEEK,
          message: "positionMs must be a number",
        });
      } else if (msg.type === WS_RADIO.QUEUE_SET) {
        const roomState = getRoomState(client.roomId);
        setRoomState(client.roomId, { ...roomState, queue: safeStringArray(msg.queue) });
        broadcastRoomState(client.roomId);
      } else {
        sendWsError(ws, {
          code: ERROR_CODES.WS_UNSUPPORTED_TYPE,
          message: "Unsupported radio message type",
          details: { type: msg?.type },
        });
      }
    });

    ws.on("close", () => {
      radioClients.delete(ws);
    });
  });
}

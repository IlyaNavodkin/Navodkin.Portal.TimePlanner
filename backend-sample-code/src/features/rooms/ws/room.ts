import { ERROR_CODES } from "../../../shared/error-codes.js";
import { WebSocketServer, WebSocket } from "ws";
import type { RolePermissions } from "../../../shared/db/types.js";
import { roomsReadCtx as roomsRead } from "../data/index.js";
import { authReadCtx } from "../../auth/data/index.js";
import { WS_ROOM } from "../ws-events.js";
import { getSocketSessionMeta } from "../../../shared/ws-auth.js";
import { createLogger } from "../../../shared/logger.js";
import { sendWsError } from "../../../shared/ws-errors.js";
import {
  claimActiveRoomConnection,
  releaseActiveRoomConnection,
} from "./active-room-connections.js";

const logger = createLogger("ws/room");

interface RoomClient {
  roomId: string;
  userId: string;
  username: string;
}

const clients = new Map<WebSocket, RoomClient>();

// roomId -> Set of userId (UUID) muted by moderator
const mutedByModerator = new Map<string, Set<string>>();
const cameraBlockedByModerator = new Map<string, Set<string>>();
const screenShareBlockedByModerator = new Map<string, Set<string>>();

function getMutedSet(roomId: string): Set<string> {
  if (!mutedByModerator.has(roomId)) mutedByModerator.set(roomId, new Set());
  return mutedByModerator.get(roomId)!;
}

function getCameraBlockedSet(roomId: string): Set<string> {
  if (!cameraBlockedByModerator.has(roomId)) {
    cameraBlockedByModerator.set(roomId, new Set());
  }
  return cameraBlockedByModerator.get(roomId)!;
}

function getScreenShareBlockedSet(roomId: string): Set<string> {
  if (!screenShareBlockedByModerator.has(roomId)) {
    screenShareBlockedByModerator.set(roomId, new Set());
  }
  return screenShareBlockedByModerator.get(roomId)!;
}

function sendTo(ws: WebSocket, payload: object): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendToUser(roomId: string, userId: string, payload: object): void {
  for (const [ws, client] of clients) {
    if (client.roomId === roomId && client.userId === userId) {
      sendTo(ws, payload);
    }
  }
}

function broadcastToRoom(roomId: string, payload: object): void {
  const msg = JSON.stringify(payload);
  for (const [ws, client] of clients) {
    if (client.roomId === roomId && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

async function assertCanModerateTarget(
  roomId: string,
  requesterId: string,
  targetUserId: string,
): Promise<boolean> {
  if (requesterId === targetUserId) return false;

  const [room, targetUser] = await Promise.all([
    roomsRead.getRoomById(roomId),
    authReadCtx.getUserById(targetUserId),
  ]);

  if (!room || !targetUser) return false;
  if (room.createdBy === targetUserId) return false;
  if (targetUser.roleName === "admin") return false;
  return true;
}

async function handleMuteToggle(
  ws: WebSocket,
  msg: { targetUserId?: string },
  muting: boolean,
): Promise<void> {
  const info = clients.get(ws);
  if (!info || !msg.targetUserId) return;
  const { roomId, userId } = info;

  // Permission check via DB: admin > room owner > participant role permission
  const [participants, requesterUser, room] = await Promise.all([
    roomsRead.getRoomParticipants(roomId),
    authReadCtx.getUserById(userId),
    roomsRead.getRoomById(roomId),
  ]);
  const isGlobalAdmin = requesterUser?.roleName === 'admin';
  const isRoomOwner = room?.createdBy === userId;
  const requester = participants.find((p) => p.id === userId);
  if (!isGlobalAdmin && !isRoomOwner && !requester?.permissions.canMute) {
    sendWsError(ws, {
      code: ERROR_CODES.ROOM_FORBIDDEN,
      message: "Not authorized to mute participants",
      details: { roomId, targetUserId: msg.targetUserId },
    });
    logger.warn("mute denied: requester has no permission", {
      roomId,
      userId,
      targetUserId: msg.targetUserId,
      muting,
    });
    return;
  }

  const canModerateTarget = await assertCanModerateTarget(roomId, userId, msg.targetUserId);
  if (!canModerateTarget) {
    sendWsError(ws, {
      code: ERROR_CODES.ROOM_MODERATION_CONFLICT,
      message: "Target cannot be moderated",
      details: { roomId, targetUserId: msg.targetUserId },
    });
    logger.warn("mute denied: protected target", {
      roomId,
      userId,
      targetUserId: msg.targetUserId,
      muting,
    });
    return;
  }

  const muted = getMutedSet(roomId);
  const targetId = msg.targetUserId;

  if (muting) {
    logger.info("mute applied", { roomId, actorUserId: userId, targetUserId: targetId });
    muted.add(targetId);
    sendToUser(roomId, targetId, { type: WS_ROOM.YOU_MUTED });
    broadcastToRoom(roomId, { type: WS_ROOM.PARTICIPANT_MUTED, userId: targetId });
  } else {
    logger.info("mute removed", { roomId, actorUserId: userId, targetUserId: targetId });
    muted.delete(targetId);
    sendToUser(roomId, targetId, { type: WS_ROOM.YOU_UNMUTED });
    broadcastToRoom(roomId, { type: WS_ROOM.PARTICIPANT_UNMUTED, userId: targetId });
  }
}

async function handleMediaBlockToggle(
  ws: WebSocket,
  msg: { targetUserId?: string },
  blocked: boolean,
  mode: "camera" | "screenshare",
): Promise<void> {
  const info = clients.get(ws);
  if (!info || !msg.targetUserId) return;
  const { roomId, userId } = info;

  const [participants, requesterUser, room] = await Promise.all([
    roomsRead.getRoomParticipants(roomId),
    authReadCtx.getUserById(userId),
    roomsRead.getRoomById(roomId),
  ]);
  const isGlobalAdmin = requesterUser?.roleName === "admin";
  const isRoomOwner = room?.createdBy === userId;
  const requester = participants.find((p) => p.id === userId);
  if (!isGlobalAdmin && !isRoomOwner && !requester?.permissions.canMute) {
    sendWsError(ws, {
      code: ERROR_CODES.ROOM_FORBIDDEN,
      message: `Not authorized to ${mode} block participants`,
      details: { roomId, targetUserId: msg.targetUserId },
    });
    logger.warn(`${mode} block denied: requester has no permission`, {
      roomId,
      userId,
      targetUserId: msg.targetUserId,
      blocked,
    });
    return;
  }

  const canModerateTarget = await assertCanModerateTarget(roomId, userId, msg.targetUserId);
  if (!canModerateTarget) {
    sendWsError(ws, {
      code: ERROR_CODES.ROOM_MODERATION_CONFLICT,
      message: "Target cannot be moderated",
      details: { roomId, targetUserId: msg.targetUserId },
    });
    logger.warn(`${mode} block denied: protected target`, {
      roomId,
      userId,
      targetUserId: msg.targetUserId,
      blocked,
    });
    return;
  }

  const blockedSet = mode === "camera" ? getCameraBlockedSet(roomId) : getScreenShareBlockedSet(roomId);
  const targetId = msg.targetUserId;

  if (blocked) {
    logger.info(`${mode} block applied`, { roomId, actorUserId: userId, targetUserId: targetId });
    blockedSet.add(targetId);
    sendToUser(roomId, targetId, {
      type: mode === "camera" ? WS_ROOM.YOU_CAMERA_BLOCKED : WS_ROOM.YOU_SCREENSHARE_BLOCKED,
    });
    broadcastToRoom(roomId, {
      type: mode === "camera" ? WS_ROOM.PARTICIPANT_CAMERA_BLOCKED : WS_ROOM.PARTICIPANT_SCREENSHARE_BLOCKED,
      userId: targetId,
    });
  } else {
    logger.info(`${mode} block removed`, { roomId, actorUserId: userId, targetUserId: targetId });
    blockedSet.delete(targetId);
    sendToUser(roomId, targetId, {
      type: mode === "camera" ? WS_ROOM.YOU_CAMERA_UNBLOCKED : WS_ROOM.YOU_SCREENSHARE_UNBLOCKED,
    });
    broadcastToRoom(roomId, {
      type: mode === "camera" ? WS_ROOM.PARTICIPANT_CAMERA_UNBLOCKED : WS_ROOM.PARTICIPANT_SCREENSHARE_UNBLOCKED,
      userId: targetId,
    });
  }
}

function unregisterClient(ws: WebSocket): void {
  const client = clients.get(ws);
  if (!client) return;
  clients.delete(ws);
  releaseActiveRoomConnection(client.roomId, client.userId, ws);
}

function handleStreamState(
  ws: WebSocket,
  msg: { trackSid?: string; identity?: string },
  started: boolean,
): void {
  const info = clients.get(ws);
  if (!info) return;
  const trackSid = typeof msg.trackSid === "string" ? msg.trackSid.trim() : "";
  if (!trackSid) return;
  const identity =
    typeof msg.identity === "string" && msg.identity.trim().length > 0
      ? msg.identity.trim()
      : info.username;
  broadcastToRoom(info.roomId, {
    type: started ? WS_ROOM.STREAM_STARTED : WS_ROOM.STREAM_STOPPED,
    trackSid,
    identity,
    userId: info.userId,
  });
}

export function setupRoomWss(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    ws.on("message", async (data) => {
      let msg: any;
      try {
        msg = JSON.parse(String(data));
      } catch {
        sendWsError(ws, {
          code: ERROR_CODES.WS_INVALID_PAYLOAD,
          message: "Invalid room websocket message",
        });
        return;
      }

      try {
        logger.debug("message-received", { type: msg?.type });

        if (msg.type === WS_ROOM.JOIN && msg.roomId) {
          const session = getSocketSessionMeta(ws);
          if (!session) return;
          unregisterClient(ws);
          const replacedWs = claimActiveRoomConnection(msg.roomId, session.userId, ws);
          if (replacedWs && replacedWs !== ws && replacedWs.readyState === WebSocket.OPEN) {
            sendTo(replacedWs, {
              type: WS_ROOM.TAKEN_OVER,
              roomId: msg.roomId,
            });
            replacedWs.close(4001, "room-taken-over");
          }
          logger.info("join", { roomId: msg.roomId, userId: session.userId });
          clients.set(ws, {
            roomId: msg.roomId,
            userId: session.userId,
            username: session.username,
          });
          // Inform joining client of currently moderated participants
          const muted = getMutedSet(msg.roomId);
          if (muted.size > 0) {
            sendTo(ws, { type: WS_ROOM.MUTED_PARTICIPANTS, userIds: [...muted] });
          }
          const cameraBlocked = getCameraBlockedSet(msg.roomId);
          if (cameraBlocked.size > 0) {
            sendTo(ws, { type: WS_ROOM.CAMERA_BLOCKED_PARTICIPANTS, userIds: [...cameraBlocked] });
          }
          const screenShareBlocked = getScreenShareBlockedSet(msg.roomId);
          if (screenShareBlocked.size > 0) {
            sendTo(ws, { type: WS_ROOM.SCREENSHARE_BLOCKED_PARTICIPANTS, userIds: [...screenShareBlocked] });
          }
        } else if (msg.type === WS_ROOM.MUTE_PARTICIPANT) {
          await handleMuteToggle(ws, msg, true);
        } else if (msg.type === WS_ROOM.UNMUTE_PARTICIPANT) {
          await handleMuteToggle(ws, msg, false);
        } else if (msg.type === WS_ROOM.BLOCK_CAMERA) {
          await handleMediaBlockToggle(ws, msg, true, "camera");
        } else if (msg.type === WS_ROOM.UNBLOCK_CAMERA) {
          await handleMediaBlockToggle(ws, msg, false, "camera");
        } else if (msg.type === WS_ROOM.BLOCK_SCREENSHARE) {
          await handleMediaBlockToggle(ws, msg, true, "screenshare");
        } else if (msg.type === WS_ROOM.UNBLOCK_SCREENSHARE) {
          await handleMediaBlockToggle(ws, msg, false, "screenshare");
        } else if (msg.type === WS_ROOM.STREAM_STARTED) {
          handleStreamState(ws, msg, true);
        } else if (msg.type === WS_ROOM.STREAM_STOPPED) {
          handleStreamState(ws, msg, false);
        } else {
          sendWsError(ws, {
            code: ERROR_CODES.WS_UNSUPPORTED_TYPE,
            message: "Unsupported room message type",
            details: { type: msg?.type },
          });
        }
      } catch (err) {
        sendWsError(ws, {
          code: ERROR_CODES.ROOM_MESSAGE_ERROR,
          message: "Failed to process room message",
        });
        logger.warn("message handling error", err);
      }
    });

    ws.on("close", () => {
      unregisterClient(ws);
    });
  });
}

export function notifyRoleUpdated(
  roomId: string,
  userId: string,
  payload: {
    roleId: string | null;
    roleName: string | null;
    roleColor: string | null;
    permissions: RolePermissions;
  },
): void {
  sendToUser(roomId, userId, { type: WS_ROOM.ROLE_UPDATED, ...payload });
}

export function notifyRoomUpdated(roomId: string, name: string, description: string | null): void {
  broadcastToRoom(roomId, { type: WS_ROOM.ROOM_UPDATED, roomId, name, description });
}

export function notifyKicked(roomId: string, userId: string): void {
  sendToUser(roomId, userId, { type: WS_ROOM.KICKED });
}

export function notifyBanned(roomId: string, userId: string): void {
  sendToUser(roomId, userId, { type: WS_ROOM.BANNED });
}

export function notifyRoomDeleted(roomId: string): void {
  broadcastToRoom(roomId, { type: WS_ROOM.DELETED });
}

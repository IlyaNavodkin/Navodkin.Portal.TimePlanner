/**
 * @openapi
 * tags:
 *   name: Rooms
 *   description: Room management
 */

import { Router } from "express";
import { roomUseCase } from "./usecases/RoomUseCase.js";
import { authenticate } from "../../shared/middleware/auth.js";
import {
  notifyRoleUpdated,
  notifyKicked,
  notifyBanned,
  notifyRoomDeleted,
  notifyRoomUpdated,
} from "./ws/room.js";
import { mapRoomHttpError } from "./httpErrors.js";
import { asyncRoute } from "../../shared/middleware/async-route.js";

const router = Router();

router.get("/api/rooms", authenticate, asyncRoute(async (_req, res) => {
  const rooms = await roomUseCase.getRooms();
  res.json(rooms);
}));

router.post("/api/rooms", authenticate, async (req, res, next) => {
  const user = req.user!;
  try {
    const room = await roomUseCase.createRoom(user.sub, user.role, req.body);
    res.status(201).json(room);
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

router.get("/api/rooms/:id", authenticate, async (req, res, next) => {
  try {
    const room = await roomUseCase.getRoom(req.params["id"] as string);
    res.json(room);
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

router.patch("/api/rooms/:id", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  try {
    await roomUseCase.updateRoom(user.sub, user.role, roomId, req.body);
    const updatedRoom = await roomUseCase.getRoom(roomId);
    notifyRoomUpdated(roomId, updatedRoom.name, updatedRoom.description ?? null);
    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

router.delete("/api/rooms/:id", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  try {
    await roomUseCase.deleteRoom(user.sub, user.role, roomId);
    notifyRoomDeleted(roomId);
    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/**
 * Join a room.
 * - Validate password if private, create/update room_members record.
 */
router.post("/api/rooms/:id/join", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  const { password } = req.body as { password?: string };

  try {
    const room = await roomUseCase.getRoom(roomId);

    const joined = await roomUseCase.joinRoomAsMember(user.sub, room.name, password);
    res.json(joined);
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

router.delete("/api/rooms/:id/leave", authenticate, async (req, res, next) => {
  const user = req.user!;
  try {
    await roomUseCase.leaveRoom(user.sub, req.params["id"] as string);
    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

router.get("/api/rooms/:id/members", authenticate, async (req, res, next) => {
  try {
    const participants = await roomUseCase.getMembers(req.params["id"] as string);
    res.json(participants);
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/** Assign a room role to a registered member */
router.patch("/api/rooms/:id/members/:userId/role", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  const targetUserId = req.params["userId"] as string;
  try {
    const { roleId } = req.body as { roleId: string | null };
    const participant = await roomUseCase.assignMemberRole(
      user.sub,
      user.role,
      roomId,
      targetUserId,
      roleId ?? null,
    );
    notifyRoleUpdated(roomId, targetUserId, {
      roleId: participant.roleId,
      roleName: participant.roleName,
      roleColor: participant.roleColor,
      permissions: participant.permissions,
    });
    const updatedRoom = await roomUseCase.getRoom(roomId);
    notifyRoomUpdated(roomId, updatedRoom.name, updatedRoom.description ?? null);
    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/** Kick a participant from the room */
router.post("/api/rooms/:id/kick", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  const { targetId } = req.body as { targetId: string };
  try {
    await roomUseCase.kickParticipant(user.sub, user.role, roomId, targetId);
    notifyKicked(roomId, targetId);
    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/** Ban a participant from the room */
router.post("/api/rooms/:id/ban", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  const { targetId } = req.body as { targetId: string };
  try {
    await roomUseCase.banParticipant(user.sub, user.role, roomId, targetId);
    notifyKicked(roomId, targetId);
    notifyBanned(roomId, targetId);
    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/** Unban a user from the room */
router.delete("/api/rooms/:id/ban/:userId", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  const targetId = req.params["userId"] as string;
  try {
    await roomUseCase.unbanParticipant(user.sub, user.role, roomId, targetId);
    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/** Get room ban list */
router.get("/api/rooms/:id/bans", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  try {
    const bans = await roomUseCase.getRoomBans(user.sub, user.role, roomId);
    res.json(bans);
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

export default router;

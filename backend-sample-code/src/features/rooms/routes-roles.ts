/**
 * @openapi
 * tags:
 *   name: RoomRoles
 *   description: Room role management
 */

import { Router } from "express";
import { roomUseCase } from "./usecases/RoomUseCase.js";
import { authenticate } from "../../shared/middleware/auth.js";
import { notifyRoleUpdated, notifyRoomUpdated } from "./ws/room.js";
import { roomsReadCtx as readCtx } from "./data/index.js";
import { mapRoomHttpError } from "./httpErrors.js";

const router = Router();

/**
 * @openapi
 * /api/rooms/{id}/roles:
 *   get:
 *     tags: [RoomRoles]
 *     summary: Get all roles for a room
 *     security:
 *       - bearerAuth: []
 */
router.get("/api/rooms/:id/roles", authenticate, async (req, res, next) => {
  try {
    const roles = await roomUseCase.getRoomRoles(req.params["id"] as string);
    res.json(roles);
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/**
 * @openapi
 * /api/rooms/{id}/roles:
 *   post:
 *     tags: [RoomRoles]
 *     summary: Create a role for a room (owner or canManageRoles)
 *     security:
 *       - bearerAuth: []
 */
router.post("/api/rooms/:id/roles", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  try {
    const role = await roomUseCase.createRoomRole(
      user.sub,
      user.role,
      roomId,
      req.body,
    );
    const updatedRoom = await roomUseCase.getRoom(roomId);
    notifyRoomUpdated(roomId, updatedRoom.name, updatedRoom.description ?? null);
    res.status(201).json(role);
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/**
 * @openapi
 * /api/rooms/{id}/roles/{roleId}:
 *   patch:
 *     tags: [RoomRoles]
 *     summary: Update a room role
 *     security:
 *       - bearerAuth: []
 */
router.patch("/api/rooms/:id/roles/:roleId", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  const roleId = req.params["roleId"] as string;
  try {
    await roomUseCase.updateRoomRole(user.sub, user.role, roomId, roleId, req.body);

    // Notify all participants who currently hold this role
    const participants = await readCtx.getRoomParticipants(roomId);
    for (const p of participants) {
      if (p.roleId === roleId) {
        notifyRoleUpdated(roomId, p.id, {
          roleId: p.roleId,
          roleName: p.roleName,
          roleColor: p.roleColor,
          permissions: p.permissions,
        });
      }
    }
    const updatedRoom = await roomUseCase.getRoom(roomId);
    notifyRoomUpdated(roomId, updatedRoom.name, updatedRoom.description ?? null);

    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

/**
 * @openapi
 * /api/rooms/{id}/roles/{roleId}:
 *   delete:
 *     tags: [RoomRoles]
 *     summary: Delete a room role
 *     security:
 *       - bearerAuth: []
 */
router.delete("/api/rooms/:id/roles/:roleId", authenticate, async (req, res, next) => {
  const user = req.user!;
  const roomId = req.params["id"] as string;
  try {
    await roomUseCase.deleteRoomRole(
      user.sub,
      user.role,
      roomId,
      req.params["roleId"] as string,
    );
    const updatedRoom = await roomUseCase.getRoom(roomId);
    notifyRoomUpdated(roomId, updatedRoom.name, updatedRoom.description ?? null);
    res.status(204).end();
  } catch (err) {
    next(mapRoomHttpError(err));
  }
});

export default router;

/**
 * @openapi
 * tags:
 *   name: LiveKit
 *   description: LiveKit token generation
 */

import { Router } from "express";
import { AccessToken } from "livekit-server-sdk";
import { LK_API_KEY, LK_API_SECRET, LK_URL_PUBLIC } from "./config.js";
import { authenticate } from "../../shared/middleware/auth.js";
import { roomsReadCtx as readCtx } from "../rooms/data/index.js";
import { mapLivekitHttpError } from "./httpErrors.js";

const router = Router();

/**
 * @openapi
 * /api/livekit-join:
 *   get:
 *     tags: [LiveKit]
 *     summary: Get LiveKit token for a room
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: room
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: LiveKit URL and JWT token
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Banned from room
 */
router.get("/api/livekit-join", authenticate, async (req, res, next) => {
  try {
    const roomName = (req.query.room as string) || "test1";
    const user = req.user!;
    const isAppAdmin = user.role === "admin";

    // Room must exist in app DB. Prevent phantom LiveKit-only rooms.
    const room = await readCtx.getRoomByName(roomName);
    if (!room) {
      next(mapLivekitHttpError(new Error("Room not found")));
      return;
    }

    const isBanned = await readCtx.isRoomBanned(room.id, user.sub);
    if (isBanned) {
      next(mapLivekitHttpError(new Error("You are banned from this room")));
      return;
    }

    if (!isAppAdmin) {
      const participants = await readCtx.getRoomParticipants(room.id);
      const me = participants.find((p) => p.type === "member" && p.id === user.sub);
      if (!me) {
        next(mapLivekitHttpError(new Error("Join room first")));
        return;
      }
    }

    const identity = user.username;

    const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
      identity,
      name: identity,
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    res.json({ url: LK_URL_PUBLIC, token });
  } catch (err) {
    next(mapLivekitHttpError(err));
  }
});

export default router;

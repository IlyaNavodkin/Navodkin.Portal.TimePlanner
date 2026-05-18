import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../shared/middleware/auth.js";
import { db } from "../../shared/db/database.js";
import { broadcastAvatarUpdated } from "../presence/ws/presence.js";
import { mapAvatarHttpError } from "./httpErrors.js";
import { asyncRoute } from "../../shared/middleware/async-route.js";

const MAX_AVATAR_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_MIMES = ["image/png", "image/jpeg"];

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error("Only PNG and JPG files are allowed"));
    }
    cb(null, true);
  },
});

const router = Router();

router.post(
  "/api/avatars/:nickname",
  authenticate,
  (req, res, next) => {
    avatarUpload.fields([
      { name: "speaking", maxCount: 1 },
      { name: "silent", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return next(mapAvatarHttpError(err));
      }
      next();
    });
  },
  asyncRoute(async (req, res, next) => {
    const ssoCheck = await db
      .selectFrom("users")
      .select("oidc_sub")
      .where("id", "=", req.user!.sub)
      .executeTakeFirst();
    if (ssoCheck?.oidc_sub) {
      next(mapAvatarHttpError(new Error("Avatar upload is not available for SSO users")));
      return;
    }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const updates: { avatar_speaking?: string; avatar_silent?: string } = {};

    if (files?.speaking?.[0]) {
      const f = files.speaking[0];
      updates.avatar_speaking = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
    }
    if (files?.silent?.[0]) {
      const f = files.silent[0];
      updates.avatar_silent = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
    }

    if (!Object.keys(updates).length) {
      next(mapAvatarHttpError(new Error("No files provided")));
      return;
    }

    try {
      await db
        .updateTable("users")
        .set(updates)
        .where("username", "=", req.user!.username)
        .execute();
    } catch (err) {
      next(mapAvatarHttpError(err));
      return;
    }

    broadcastAvatarUpdated(req.user!.username);
    res.json({ ok: true });
  }),
);

router.get("/api/avatars/:nickname/:type", asyncRoute(async (req, res, next) => {
  const rawNickname = req.params["nickname"];
  const rawType = req.params["type"];
  const nickname = decodeURIComponent(Array.isArray(rawNickname) ? (rawNickname[0] ?? "") : rawNickname);
  const type = Array.isArray(rawType) ? (rawType[0] ?? "") : rawType;
  if (!["speaking", "silent"].includes(type)) {
    next(mapAvatarHttpError(new Error("type must be speaking or silent")));
    return;
  }

  const col = type === "speaking" ? "avatar_speaking" : "avatar_silent";

  let row: Record<string, string | null> | undefined;
  try {
    row = await db
      .selectFrom("users")
      .select(col)
      .where("username", "=", nickname)
      .executeTakeFirst();
  } catch (err) {
    next(mapAvatarHttpError(err));
    return;
  }

  const dataUri: string | null | undefined = row?.[col];
  if (!dataUri) {
    next(mapAvatarHttpError(new Error("avatar not found")));
    return;
  }

  // data:<mime>;base64,<data>
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    next(mapAvatarHttpError(new Error("corrupted avatar data")));
    return;
  }

  const [, mime, b64] = match;
  const buf = Buffer.from(b64, "base64");
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(buf);
}));

export default router;

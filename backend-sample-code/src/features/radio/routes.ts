import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { RADIO_DIR } from "./config.js";
import { broadcastTracksUpdated, removeTrackFromRadioState } from "./ws/radio.js";
import { authenticate } from "../../shared/middleware/auth.js";
import { requireRole } from "../../shared/middleware/roles.js";
import { mapRadioHttpError } from "./httpErrors.js";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const radioUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, RADIO_DIR);
    },
    filename(_req, file, cb) {
      // multer/busboy decodes the multipart filename bytes as Latin-1 by default,
      // but browsers send UTF-8 — re-encode to get the actual Unicode name.
      const decoded = Buffer.from(file.originalname, "latin1").toString("utf8");
      const safe = decoded.replace(/[^\p{L}\p{N}._\- ]/gu, "_");
      cb(null, safe);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter(_req, file, cb) {
    if (
      file.mimetype !== "audio/mpeg" &&
      !file.originalname.toLowerCase().endsWith(".mp3")
    ) {
      return cb(new Error("Only MP3 files are allowed"));
    }
    cb(null, true);
  },
});

const router = Router();
const adminOnly = [authenticate, requireRole("admin")];

router.get("/api/radio", (_req, res, next) => {
  try {
    const files = fs
      .readdirSync(RADIO_DIR)
      .filter((f) => f.toLowerCase().endsWith(".mp3"))
      .map((f) => {
        const stat = fs.statSync(path.join(RADIO_DIR, f));
        return {
          id: f,
          name: f.replace(/\.mp3$/i, ""),
          sizeBytes: stat.size,
        };
      });
    res.json(files);
  } catch (err) {
    next(mapRadioHttpError(err));
  }
});

router.get("/api/radio/:filename", (req, res, next) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(RADIO_DIR, filename);
  if (!fs.existsSync(filePath)) {
    next(mapRadioHttpError(new Error("not found")));
    return;
  }
  res.sendFile(filePath);
});

router.post(
  "/api/radio",
  ...adminOnly,
  (req, res, next) => {
    radioUpload.array("files")(req, res, (err) => {
      if (err) return next(mapRadioHttpError(err));
      next();
    });
  },
  (_req, res) => {
    broadcastTracksUpdated();
    res.json({ ok: true });
  },
);

router.delete("/api/radio/:filename", ...adminOnly, (req, res, next) => {
  const rawFilename = req.params["filename"];
  const filename = path.basename(Array.isArray(rawFilename) ? (rawFilename[0] ?? "") : rawFilename);
  const filePath = path.join(RADIO_DIR, filename);
  if (!fs.existsSync(filePath)) {
    next(mapRadioHttpError(new Error("not found")));
    return;
  }
  try {
    fs.unlinkSync(filePath);
    removeTrackFromRadioState(filename);
    broadcastTracksUpdated();
    res.json({ ok: true });
  } catch (err) {
    next(mapRadioHttpError(err));
  }
});

export default router;

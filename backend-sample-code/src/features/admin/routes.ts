import { ERROR_CODES } from "../../shared/error-codes.js";
/**
 * @openapi
 * tags:
 *   name: Admin
 *   description: Admin-only endpoints
 */

import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { userUseCase } from "./usecases/UserUseCase.js";
import { roomUseCase } from "../rooms/usecases/RoomUseCase.js";
import { notifyRoomDeleted } from "../rooms/ws/room.js";
import { authenticate } from "../../shared/middleware/auth.js";
import { requireRole } from "../../shared/middleware/roles.js";
import { BRANDING_DIR } from "../../shared/config.js";
import { authUseCase } from "../auth/usecases/AuthUseCase.js";
import { closeSocketsBySessionIds } from "../../shared/ws-auth.js";
import { AppError } from "../../shared/errors.js";
import { mapAdminHttpError } from "./httpErrors.js";
import { asyncRoute } from "../../shared/middleware/async-route.js";
import {
  getOidcRuntimeConfig,
  updateOidcRuntimeConfig,
  type OidcRuntimeConfigPatch,
} from "../auth/usecases/OidcRuntimeConfig.js";
import {
  getBrandingRuntimeConfig,
  resetBrandingRuntimeConfig,
  updateBrandingRuntimeConfig,
  type BrandingRuntimeConfigPatch,
} from "../branding/usecases/BrandingRuntimeConfig.js";
import { postAdminOidcBootstrap } from "./controllers/oidcBootstrapController.js";
import { adminMutateCtx, adminReadCtx } from "./data/index.js";

const router = Router();

const adminGuard = [authenticate, requireRole("admin")];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function asOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim();
}

const ASSET_RULES = {
  logo: {
    maxBytes: 1 * 1024 * 1024,
    allowedMime: new Set(["image/svg+xml", "image/png", "image/webp"]),
  },
  favicon: {
    maxBytes: 256 * 1024,
    allowedMime: new Set(["image/svg+xml", "image/png"]),
  },
  background: {
    maxBytes: 5 * 1024 * 1024,
    allowedMime: new Set(["image/png", "image/jpeg", "image/webp"]),
  },
} as const;

type BrandAssetKind = keyof typeof ASSET_RULES;
const ASSET_EXT_BY_MIME: Record<string, string> = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};
const ALL_ASSET_EXTENSIONS = [".svg", ".png", ".jpg", ".jpeg", ".webp"];

function isBrandAssetKind(value: string): value is BrandAssetKind {
  return value === "logo" || value === "favicon" || value === "background";
}

function removeAssetFiles(kind: BrandAssetKind): void {
  for (const ext of ALL_ASSET_EXTENSIONS) {
    const filePath = path.join(BRANDING_DIR, `${kind}${ext}`);
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  }
}

function clearBrandingAssets(): void {
  for (const kind of ["logo", "favicon", "background"] as const) {
    removeAssetFiles(kind);
  }
}

function parseThemeColors(value: unknown): BrandingRuntimeConfigPatch["themeColors"] | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const source = value as Record<string, unknown>;
  const patch: NonNullable<BrandingRuntimeConfigPatch["themeColors"]> = {};
  const keys = [
    "brand",
    "bgBase",
    "bgFloat",
    "bgElevated",
    "bgModifier",
    "textPrimary",
    "textBody",
    "textSecondary",
    "textMuted",
  ] as const;
  for (const key of keys) {
    if (typeof source[key] === "string") patch[key] = source[key];
  }
  return Object.keys(patch).length ? patch : undefined;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return fallback;
  return parsed;
}

/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: integer
 *         description: Filter by role ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by username
 *     responses:
 *       200:
 *         description: Array of users
 */
router.get("/api/admin/users", ...adminGuard, asyncRoute(async (req, res) => {
  const roleId = req.query.role ? Number(req.query.role) : undefined;
  const search = req.query.search as string | undefined;
  const users = await userUseCase.getUsers({ roleId, search });
  res.json(users);
}));

/**
 * @openapi
 * /api/admin/users/{id}:
 *   patch:
 *     tags: [Admin]
 *     summary: Change user role (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId]
 *             properties:
 *               roleId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Updated user
 *       404:
 *         description: User not found
 */
router.patch("/api/admin/users/:id", ...adminGuard, async (req, res, next) => {
  const roleId = (req.body as { roleId?: unknown })?.roleId;
  if (roleId === null || roleId === undefined) {
    next(new AppError({
      status: 400,
      code: ERROR_CODES.ADMIN_ROLE_ID_REQUIRED,
      message: "roleId is required",
    }));
    return;
  }
  if (typeof roleId !== "number" || !Number.isFinite(roleId) || !Number.isInteger(roleId) || roleId <= 0) {
    next(new AppError({
      status: 400,
      code: ERROR_CODES.ADMIN_ROLE_ID_INVALID,
      message: "roleId must be a positive integer",
    }));
    return;
  }
  try {
    const user = await userUseCase.updateRole(req.user!.sub, req.params["id"] as string, roleId);
    res.json(user);
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

/**
 * @openapi
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete user (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted
 */
router.delete("/api/admin/users/:id", ...adminGuard, async (req, res, next) => {
  try {
    await userUseCase.deleteUser(req.user!.sub, req.params["id"] as string);
    res.status(204).end();
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

/**
 * @openapi
 * /api/admin/rooms:
 *   get:
 *     tags: [Admin]
 *     summary: List all rooms (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of rooms
 */
router.get("/api/admin/rooms", ...adminGuard, asyncRoute(async (_req, res) => {
  const rooms = await roomUseCase.getRooms();
  res.json(rooms);
}));

/**
 * @openapi
 * /api/admin/rooms/{id}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete any room (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted
 */
router.delete("/api/admin/rooms/:id", ...adminGuard, async (req, res, next) => {
  const roomId = req.params["id"] as string;
  try {
    await roomUseCase.deleteRoom(req.user!.sub, "admin", roomId);
    notifyRoomDeleted(roomId);
    res.status(204).end();
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

/**
 * @openapi
 * /api/admin/users/{id}/ban:
 *   post:
 *     tags: [Admin]
 *     summary: Ban user from the app (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       204:
 *         description: Banned
 */
router.post("/api/admin/users/:id/ban", ...adminGuard, async (req, res, next) => {
  const { reason } = req.body as { reason?: string };
  try {
    await userUseCase.banUser(req.user!.sub, req.params["id"] as string, reason);
    res.status(204).end();
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

/**
 * @openapi
 * /api/admin/users/{id}/ban:
 *   delete:
 *     tags: [Admin]
 *     summary: Unban user from the app (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Unbanned
 */
router.delete("/api/admin/users/:id/ban", ...adminGuard, async (req, res, next) => {
  try {
    await userUseCase.unbanUser(req.user!.sub, req.params["id"] as string);
    res.status(204).end();
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

/**
 * @openapi
 * /api/admin/bans:
 *   get:
 *     tags: [Admin]
 *     summary: List all app bans (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of app bans
 */
router.get("/api/admin/bans", ...adminGuard, asyncRoute(async (_req, res) => {
  const bans = await userUseCase.getAppBans();
  res.json(bans);
}));

router.get("/api/admin/logs", ...adminGuard, asyncRoute(async (req, res) => {
  const rawLevel = typeof req.query["level"] === "string" ? req.query["level"] : "";
  const level = rawLevel === "debug" || rawLevel === "info" || rawLevel === "warn" || rawLevel === "error"
    ? rawLevel
    : undefined;
  const sortBy = req.query["sortBy"] === "level" ? "level" : "createdAt";
  const sortDirection = req.query["sortDirection"] === "asc" ? "asc" : "desc";
  const fromRaw = typeof req.query["from"] === "string" ? req.query["from"] : undefined;
  const toRaw = typeof req.query["to"] === "string" ? req.query["to"] : undefined;
  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;

  const logs = await adminReadCtx.getAppLogs({
    userId: typeof req.query["userId"] === "string" ? req.query["userId"] : undefined,
    level,
    from: from && Number.isFinite(from.getTime()) ? from : undefined,
    to: to && Number.isFinite(to.getTime()) ? to : undefined,
    q: typeof req.query["q"] === "string" ? req.query["q"] : undefined,
    sortBy,
    sortDirection,
    page: asPositiveInt(req.query["page"], 1),
    limit: asPositiveInt(req.query["limit"], 50),
  });

  res.json(logs);
}));

router.post("/api/admin/logs/clear", ...adminGuard, async (req, res, next) => {
  try {
    const body = req.body as {
      olderThan?: string;
      deleteAll?: boolean;
      confirmText?: string;
    };

    if (body.deleteAll === true) {
      if (body.confirmText !== "DELETE ALL LOGS") {
        next(new AppError({
          status: 400,
          code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
          message: "Invalid confirmation text for full log deletion",
        }));
        return;
      }
      const deleted = await adminMutateCtx.deleteAllAppLogs();
      res.json({ deleted });
      return;
    }

    if (!body.olderThan) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "olderThan is required",
      }));
      return;
    }
    const olderThanDate = new Date(body.olderThan);
    if (!Number.isFinite(olderThanDate.getTime())) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "olderThan must be a valid date",
      }));
      return;
    }
    const deleted = await adminMutateCtx.deleteAppLogsOlderThan(olderThanDate);
    res.json({ deleted });
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

router.get("/api/admin/branding", ...adminGuard, asyncRoute(async (_req, res) => {
  const branding = await getBrandingRuntimeConfig();
  res.json(branding);
}));

router.patch("/api/admin/branding", ...adminGuard, async (req, res, next) => {
  const body = req.body as Record<string, unknown>;
  const patch: BrandingRuntimeConfigPatch = {};

  const appName = asOptionalTrimmedString(body.appName);
  if (appName !== undefined) patch.appName = appName;
  const htmlTitle = asOptionalTrimmedString(body.htmlTitle);
  if (htmlTitle !== undefined) patch.htmlTitle = htmlTitle;
  const tagline = asOptionalTrimmedString(body.tagline);
  if (tagline !== undefined) patch.tagline = tagline;
  const logoUrl = asOptionalTrimmedString(body.logoUrl);
  if (logoUrl !== undefined) patch.logoUrl = logoUrl;
  const faviconUrl = asOptionalTrimmedString(body.faviconUrl);
  if (faviconUrl !== undefined) patch.faviconUrl = faviconUrl;
  if (typeof body.backgroundUrl === "string") {
    patch.backgroundUrl = body.backgroundUrl.trim() || null;
  } else if (body.backgroundUrl === null) {
    patch.backgroundUrl = null;
  }

  const themeColors = parseThemeColors(body.themeColors);
  if (themeColors) patch.themeColors = themeColors;

  try {
    const branding = await updateBrandingRuntimeConfig(patch);
    res.json(branding);
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

router.post("/api/admin/branding/reset", ...adminGuard, async (_req, res, next) => {
  try {
    clearBrandingAssets();
    const branding = await resetBrandingRuntimeConfig();
    res.json(branding);
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

router.post(
  "/api/admin/branding/assets/:kind",
  ...adminGuard,
  upload.single("file"),
  async (req, res, next) => {
    const kindRaw = req.params["kind"] as string;
    if (!isBrandAssetKind(kindRaw)) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "Invalid asset kind",
      }));
      return;
    }

    const file = req.file;
    if (!file) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "file is required",
      }));
      return;
    }

    const rules = ASSET_RULES[kindRaw];
    if (!rules.allowedMime.has(file.mimetype)) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "Unsupported file format",
      }));
      return;
    }
    if (file.size > rules.maxBytes) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "File is too large",
      }));
      return;
    }
    if (file.size === 0) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "File is empty",
      }));
      return;
    }

    const ext = ASSET_EXT_BY_MIME[file.mimetype];
    if (!ext) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.ADMIN_VALIDATION_ERROR,
        message: "Unsupported file format",
      }));
      return;
    }

    removeAssetFiles(kindRaw);
    const filename = `${kindRaw}${ext}`;
    const filePath = path.join(BRANDING_DIR, filename);
    fs.writeFileSync(filePath, file.buffer);
    const version = Date.now();
    const url = `/api/branding-assets/${filename}?v=${version}`;

    try {
      const updated = await updateBrandingRuntimeConfig({
        ...(kindRaw === "logo" ? { logoUrl: url } : {}),
        ...(kindRaw === "favicon" ? { faviconUrl: url } : {}),
        ...(kindRaw === "background" ? { backgroundUrl: url } : {}),
      });
      res.json({ url, branding: updated });
    } catch (err) {
      next(mapAdminHttpError(err));
    }
  },
);

router.get("/api/admin/oidc", ...adminGuard, asyncRoute(async (_req, res) => {
  const cfg = await getOidcRuntimeConfig();
  res.json({
    enabled: cfg.enabled,
    providerName: cfg.providerName,
    issuer: cfg.issuer,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: cfg.redirectUri,
    scope: cfg.scope,
    usernameClaim: cfg.usernameClaim,
    avatarClaim: cfg.avatarClaim,
  });
}));

router.patch("/api/admin/oidc", ...adminGuard, async (req, res, next) => {
  const body = req.body as Record<string, unknown>;
  const patch: OidcRuntimeConfigPatch = {};
  const revokeAllSessions = body.revokeAllSessions === true;

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  const providerName = asOptionalTrimmedString(body.providerName);
  if (providerName !== undefined) patch.providerName = providerName;

  const issuer = asOptionalTrimmedString(body.issuer);
  if (issuer !== undefined) patch.issuer = issuer;

  const clientId = asOptionalTrimmedString(body.clientId);
  if (clientId !== undefined) patch.clientId = clientId;

  if (typeof body.clientSecret === "string") patch.clientSecret = body.clientSecret;

  const redirectUri = asOptionalTrimmedString(body.redirectUri);
  if (redirectUri !== undefined) patch.redirectUri = redirectUri;

  const scope = asOptionalTrimmedString(body.scope);
  if (scope !== undefined) patch.scope = scope;

  const usernameClaim = asOptionalTrimmedString(body.usernameClaim);
  if (usernameClaim !== undefined) patch.usernameClaim = usernameClaim;

  const avatarClaim = asOptionalTrimmedString(body.avatarClaim);
  if (avatarClaim !== undefined) patch.avatarClaim = avatarClaim;

  try {
    const cfg = await updateOidcRuntimeConfig(patch);
    if (revokeAllSessions) {
      const revokedSessionIds = await authUseCase.revokeAllSessions("oidc-settings-updated");
      closeSocketsBySessionIds(revokedSessionIds, 4401, "admin-revoked-all-sessions");
    }
    res.json({
      enabled: cfg.enabled,
      providerName: cfg.providerName,
      issuer: cfg.issuer,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: cfg.redirectUri,
      scope: cfg.scope,
      usernameClaim: cfg.usernameClaim,
      avatarClaim: cfg.avatarClaim,
    });
  } catch (err) {
    next(mapAdminHttpError(err));
  }
});

/**
 * @openapi
 * /api/admin/oidc/bootstrap:
 *   post:
 *     tags: [Admin]
 *     summary: Ensure Keycloak realm/client from current OIDC runtime config (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Provisioning result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [skipped, applied]
 *                 message:
 *                   type: string
 *                 realm:
 *                   type: string
 *                 clientId:
 *                   type: string
 *       400:
 *         description: Provisioning failed
 */
router.post("/api/admin/oidc/bootstrap", ...adminGuard, postAdminOidcBootstrap);

export default router;

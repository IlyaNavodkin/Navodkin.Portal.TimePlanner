import { ERROR_CODES } from "../../shared/error-codes.js";
/**
 * @openapi
 * tags:
 *   name: Migrations
 *   description: Database migration management (requires X-Migrate-Secret header)
 */

import { Router, Request, Response } from "express";
import { migrationUseCase } from "./usecases/MigrationUseCase.js";
import { MIGRATE_SECRET } from "../../shared/config.js";
import { AppError } from "../../shared/errors.js";
import { mapMigrationHttpError } from "./httpErrors.js";

const router = Router();

function checkSecret(req: Request, res: Response, next: (err?: unknown) => void): boolean {
  if ((req.body as { secret?: string }).secret !== MIGRATE_SECRET) {
    next(new AppError({
      status: 403,
      code: ERROR_CODES.MIGRATION_SECRET_INVALID,
      message: "Invalid migrate secret",
    }));
    return false;
  }
  return true;
}

/**
 * @openapi
 * /api/migrate/status:
 *   post:
 *     tags: [Migrations]
 *     summary: Get migration status
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [secret]
 *             properties:
 *               secret:
 *                 type: string
 *     responses:
 *       200:
 *         description: Applied and pending migrations
 *       403:
 *         description: Invalid secret
 */
router.post("/api/migrate/status", async (req, res, next) => {
  if (!checkSecret(req, res, next)) return;
  try {
    const status = await migrationUseCase.status();
    res.json(status);
  } catch (err) {
    next(mapMigrationHttpError(err));
  }
});

/**
 * @openapi
 * /api/migrate/up:
 *   post:
 *     tags: [Migrations]
 *     summary: Apply migrations up to target (inclusive)
 *     security:
 *       - migrateSecret: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [secret, target]
 *             properties:
 *               secret:
 *                 type: string
 *               target:
 *                 type: string
 *                 example: "20260329_002_create_rooms"
 *     responses:
 *       200:
 *         description: List of applied migrations
 *       400:
 *         description: Missing target
 *       403:
 *         description: Invalid secret
 *       500:
 *         description: Migration error
 */
router.post("/api/migrate/up", async (req, res, next) => {
  if (!checkSecret(req, res, next)) return;
  const { target } = req.body as { target?: string };
  if (!target) {
    next(new AppError({
      status: 400,
      code: ERROR_CODES.MIGRATION_TARGET_REQUIRED,
      message: "target is required",
    }));
    return;
  }
  try {
    const result = await migrationUseCase.up(target);
    res.json(result);
  } catch (err) {
    next(mapMigrationHttpError(err));
  }
});

/**
 * @openapi
 * /api/migrate/down:
 *   post:
 *     tags: [Migrations]
 *     summary: Revert migrations after target (exclusive — target stays applied)
 *     security:
 *       - migrateSecret: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [secret, target]
 *             properties:
 *               secret:
 *                 type: string
 *               target:
 *                 type: string
 *                 example: "20260329_001_create_roles_users"
 *     responses:
 *       200:
 *         description: List of reverted migrations
 *       400:
 *         description: Missing target
 *       403:
 *         description: Invalid secret
 *       500:
 *         description: Migration error
 */
router.post("/api/migrate/down", async (req, res, next) => {
  if (!checkSecret(req, res, next)) return;
  const { target } = req.body as { target?: string };
  if (!target) {
    next(new AppError({
      status: 400,
      code: ERROR_CODES.MIGRATION_TARGET_REQUIRED,
      message: "target is required",
    }));
    return;
  }
  try {
    const result = await migrationUseCase.down(target);
    res.json(result);
  } catch (err) {
    next(mapMigrationHttpError(err));
  }
});

export default router;

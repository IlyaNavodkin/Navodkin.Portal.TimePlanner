import bcrypt from "bcrypt";
import { db } from "../../../shared/db/database.js";
import { createLogger } from "../../../shared/logger.js";
import { authReadCtx as readCtx, authMutateCtx as mutateCtx } from "../data/index.js";

const logger = createLogger("default-admin");
const BCRYPT_ROUNDS = 12;

type EnsureStatus = "created" | "updated";

export interface EnsureDefaultAdminResult {
  status: EnsureStatus;
  message: string;
  username?: string;
  actions?: string[];
}

export class DefaultAdminUseCase {
  async ensureFromEnv(): Promise<EnsureDefaultAdminResult> {
    const username = (process.env.SERVER_DEFAULT_ADMIN_USERNAME || process.env.DEFAULT_ADMIN_USERNAME || "admin").trim() || "admin";
    const password = process.env.SERVER_DEFAULT_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "admin";

    const adminRole = await readCtx.getRoleByName("admin");
    if (!adminRole) {
      throw new Error("Role 'admin' is missing. Apply DB migrations first.");
    }

    const existing = await readCtx.getUserByUsername(username);
    const nextPasswordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    if (!existing) {
      await mutateCtx.createUser({
        username,
        passwordHash: nextPasswordHash,
        roleId: adminRole.id,
      });
      logger.info("Default admin user created", { username });
      return {
        status: "created",
        message: "Default admin user created",
        username,
        actions: ["created-user", "set-role-admin", "set-password"],
      };
    }

    const actions: string[] = [];
    if (existing.roleName !== "admin") {
      await mutateCtx.updateUserRole(existing.id, adminRole.id);
      actions.push("set-role-admin");
    }

    const raw = await db
      .selectFrom("users")
      .select("password_hash")
      .where("id", "=", existing.id)
      .executeTakeFirst();

    const hasValidPassword = !!raw?.password_hash && (await bcrypt.compare(password, raw.password_hash));
    if (!hasValidPassword) {
      await db
        .updateTable("users")
        .set({ password_hash: nextPasswordHash })
        .where("id", "=", existing.id)
        .execute();
      actions.push("set-password");
    }

    if (actions.length === 0) {
      return {
        status: "updated",
        message: "Default admin user already up to date",
        username,
        actions,
      };
    }

    logger.info("Default admin user synchronized", { username, actions });
    return {
      status: "updated",
      message: "Default admin user synchronized",
      username,
      actions,
    };
  }
}

export const defaultAdminUseCase = new DefaultAdminUseCase();

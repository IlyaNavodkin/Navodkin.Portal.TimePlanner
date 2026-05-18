import { db } from "../../../shared/db/database.js";
import type { IAdminMutateContext } from "./interfaces.js";

export class AdminMutateDataContext implements IAdminMutateContext {
  async addAppBan(userId: string, bannedBy: string, reason?: string): Promise<void> {
    await db
      .insertInto("app_bans")
      .values({
        user_id: userId,
        banned_by: bannedBy,
        reason: reason ?? null,
      })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          banned_by: bannedBy,
          reason: reason ?? null,
        })
      )
      .execute();
  }

  async removeAppBan(userId: string): Promise<void> {
    await db.deleteFrom("app_bans").where("user_id", "=", userId).execute();
  }

  async deleteAppLogsOlderThan(olderThan: Date): Promise<number> {
    const rows = await db
      .deleteFrom("app_logs")
      .where("created_at", "<", olderThan)
      .returning("id")
      .execute();
    return rows.length;
  }

  async deleteAllAppLogs(): Promise<number> {
    const rows = await db.deleteFrom("app_logs").returning("id").execute();
    return rows.length;
  }
}

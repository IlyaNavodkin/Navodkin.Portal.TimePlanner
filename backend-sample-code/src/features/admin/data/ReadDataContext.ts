import { db } from "../../../shared/db/database.js";
import type { IAdminReadContext } from "./interfaces.js";
import type { AppBanDto, AppLogListParams, AppLogListResult } from "./dto.js";

export class AdminReadDataContext implements IAdminReadContext {
  async isAppBanned(userId: string): Promise<boolean> {
    const row = await db
      .selectFrom("app_bans")
      .select("user_id")
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return !!row;
  }

  async getAppBans(): Promise<AppBanDto[]> {
    const rows = await db
      .selectFrom("app_bans as ab")
      .innerJoin("users as u", "u.id", "ab.user_id")
      .innerJoin("users as b", "b.id", "ab.banned_by")
      .select([
        "ab.user_id",
        "u.username",
        "ab.banned_by",
        "b.username as banned_by_username",
        "ab.reason",
        "ab.banned_at",
      ])
      .orderBy("ab.banned_at", "desc")
      .execute();
    return rows.map((r) => ({
      userId: r.user_id,
      username: r.username,
      bannedBy: r.banned_by,
      bannedByUsername: r.banned_by_username,
      reason: r.reason,
      bannedAt: r.banned_at,
    }));
  }

  async getAppLogs(params: AppLogListParams): Promise<AppLogListResult> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 200) : 50;
    const offset = (page - 1) * limit;
    const sortBy = params.sortBy === "level" ? "level" : "created_at";
    const sortDirection = params.sortDirection === "asc" ? "asc" : "desc";

    let base = db.selectFrom("app_logs");
    if (params.userId) base = base.where("user_id", "=", params.userId);
    if (params.level) base = base.where("level", "=", params.level);
    if (params.from) base = base.where("created_at", ">=", params.from);
    if (params.to) base = base.where("created_at", "<=", params.to);
    if (params.q) {
      const pattern = `%${params.q}%`;
      base = base.where((eb) =>
        eb.or([
          eb("message", "ilike", pattern),
          eb("scope", "ilike", pattern),
          eb("username", "ilike", pattern),
        ])
      );
    }

    const totalRow = await base.select(({ fn }) => fn.count<number>("id").as("count")).executeTakeFirst();
    const rows = await base
      .select([
        "id",
        "created_at",
        "level",
        "scope",
        "message",
        "meta",
        "source",
        "user_id",
        "username",
      ])
      .orderBy(sortBy, sortDirection)
      .offset(offset)
      .limit(limit)
      .execute();

    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        level: row.level,
        scope: row.scope,
        message: row.message,
        meta: row.meta,
        source: row.source,
        userId: row.user_id,
        username: row.username,
      })),
      total: Number(totalRow?.count ?? 0),
      page,
      limit,
    };
  }
}

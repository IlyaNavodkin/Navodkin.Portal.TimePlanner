import fs from "fs";
import path from "path";
import { sql } from "kysely";
import { db } from "../../../shared/db/database.js";
import { MIGRATIONS_DIR } from "../../../shared/config.js";

export interface MigrationStatus {
  filename: string;
  appliedAt: Date | null;
}

function extractTimestamp(filename: string): number {
  const match = filename.match(/^(\d+)_/);
  if (!match) return 0;
  return parseInt(match[1], 10);
}

export class MigrationService {
  async bootstrap(): Promise<void> {
    const initPath = path.join(MIGRATIONS_DIR, "init.sql");
    const initSql = fs.readFileSync(initPath, "utf-8");
    await sql.raw(initSql).execute(db);
  }

  async applyAllPending(): Promise<string[]> {
    const all = this.getMigrationNames();
    if (all.length === 0) return [];
    const last = all[all.length - 1]!;
    return this.up(last);
  }

  private getMigrationNames(): string[] {
    const files = fs.readdirSync(MIGRATIONS_DIR);
    return files
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".revert.sql") && f !== "init.sql")
      .map((f) => f.replace(/\.sql$/, ""))
      .sort((a, b) => extractTimestamp(a) - extractTimestamp(b));
  }

  private async getApplied(): Promise<string[]> {
    const rows = await db
      .selectFrom("migrations")
      .select("filename")
      .orderBy("filename", "asc")
      .execute();
    return rows.map((r) => r.filename);
  }

  async getStatus(): Promise<{ applied: MigrationStatus[]; pending: string[] }> {
    const all = this.getMigrationNames();
    const applied = await this.getApplied();
    const appliedSet = new Set(applied);

    const appliedRows = await db
      .selectFrom("migrations")
      .selectAll()
      .execute();
    const appliedMap = new Map(appliedRows.map((r) => [r.filename, r.applied_at]));

    return {
      applied: applied.map((f) => ({ filename: f, appliedAt: appliedMap.get(f) ?? null })),
      pending: all.filter((f) => !appliedSet.has(f)),
    };
  }

  async up(target: string): Promise<string[]> {
    const all = this.getMigrationNames();
    const applied = new Set(await this.getApplied());

    const targetIdx = all.indexOf(target);
    if (targetIdx === -1) throw new Error(`Migration "${target}" not found`);

    const toApply = all.slice(0, targetIdx + 1).filter((f) => !applied.has(f));
    const result: string[] = [];

    for (const name of toApply) {
      const filePath = path.join(MIGRATIONS_DIR, `${name}.sql`);
      const sqlText = fs.readFileSync(filePath, "utf-8");

      await db.transaction().execute(async (trx) => {
        await sql.raw(sqlText).execute(trx);
        await trx
          .insertInto("migrations")
          .values({ filename: name })
          .execute();
      });

      result.push(name);
    }

    return result;
  }

  async down(target: string): Promise<string[]> {
    const all = this.getMigrationNames();
    const applied = await this.getApplied();

    const targetIdx = all.indexOf(target);
    if (targetIdx === -1) throw new Error(`Migration "${target}" not found`);

    const toRevert = applied
      .filter((f) => all.indexOf(f) > targetIdx)
      .sort((a, b) => extractTimestamp(b) - extractTimestamp(a));

    const result: string[] = [];

    for (const name of toRevert) {
      const revertPath = path.join(MIGRATIONS_DIR, `${name}.revert.sql`);
      if (!fs.existsSync(revertPath)) {
        throw new Error(`Revert file not found for migration "${name}"`);
      }
      const sqlText = fs.readFileSync(revertPath, "utf-8");

      await db.transaction().execute(async (trx) => {
        await sql.raw(sqlText).execute(trx);
        await trx
          .deleteFrom("migrations")
          .where("filename", "=", name)
          .execute();
      });

      result.push(name);
    }

    return result;
  }
}

export const migrationService = new MigrationService();

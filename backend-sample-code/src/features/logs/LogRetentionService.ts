import { db } from "../../shared/db/database.js";
import { createLogger } from "../../shared/logger.js";
import {
  LOG_RETENTION_BATCH_SIZE,
  LOG_RETENTION_DAYS,
  LOG_RETENTION_INTERVAL_MINUTES,
} from "../../shared/config.js";

const logger = createLogger("log-retention");

export class LogRetentionService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    const intervalMs = LOG_RETENTION_INTERVAL_MINUTES * 60_000;
    this.timer = setInterval(() => {
      void this.runCleanup();
    }, intervalMs);
    void this.runCleanup();
    logger.info("Log retention started", {
      days: LOG_RETENTION_DAYS,
      intervalMinutes: LOG_RETENTION_INTERVAL_MINUTES,
      batchSize: LOG_RETENTION_BATCH_SIZE,
    });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runCleanup(days = LOG_RETENTION_DAYS): Promise<number> {
    const deleted = await this.deleteOlderThanDays(days, LOG_RETENTION_BATCH_SIZE);
    if (deleted > 0) {
      logger.info("Log retention cleanup completed", { deleted, days });
    }
    return deleted;
  }

  async deleteOlderThanDays(days: number, batchSize: number): Promise<number> {
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let deletedTotal = 0;
    while (true) {
      const rows = await db
        .deleteFrom("app_logs")
        .where("id", "in", (eb) =>
          eb.selectFrom("app_logs")
            .select("id")
            .where("created_at", "<", threshold)
            .orderBy("created_at", "asc")
            .limit(batchSize)
        )
        .returning("id")
        .execute();
      deletedTotal += rows.length;
      if (rows.length < batchSize) break;
    }
    return deletedTotal;
  }
}

export const logRetentionService = new LogRetentionService();

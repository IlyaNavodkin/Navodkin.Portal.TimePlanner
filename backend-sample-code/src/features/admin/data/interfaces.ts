import type { AppBanDto, AppLogListParams, AppLogListResult } from "./dto.js";

export interface IAdminReadContext {
  isAppBanned(userId: string): Promise<boolean>;
  getAppBans(): Promise<AppBanDto[]>;
  getAppLogs(params: AppLogListParams): Promise<AppLogListResult>;
}

export interface IAdminMutateContext {
  addAppBan(userId: string, bannedBy: string, reason?: string): Promise<void>;
  removeAppBan(userId: string): Promise<void>;
  deleteAppLogsOlderThan(olderThan: Date): Promise<number>;
  deleteAllAppLogs(): Promise<number>;
}

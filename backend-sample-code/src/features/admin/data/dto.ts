export interface AppBanDto {
  userId: string;
  username: string;
  bannedBy: string;
  bannedByUsername: string;
  reason: string | null;
  bannedAt: Date;
}

export type AppLogLevel = "debug" | "info" | "warn" | "error";
export type AppLogSortField = "createdAt" | "level";
export type AppLogSortDirection = "asc" | "desc";

export interface AppLogDto {
  id: number;
  createdAt: Date;
  level: AppLogLevel;
  scope: string;
  message: string;
  meta: Record<string, unknown> | null;
  source: string;
  userId: string | null;
  username: string | null;
}

export interface AppLogListParams {
  userId?: string;
  level?: AppLogLevel;
  from?: Date;
  to?: Date;
  q?: string;
  sortBy?: AppLogSortField;
  sortDirection?: AppLogSortDirection;
  page?: number;
  limit?: number;
}

export interface AppLogListResult {
  items: AppLogDto[];
  total: number;
  page: number;
  limit: number;
}

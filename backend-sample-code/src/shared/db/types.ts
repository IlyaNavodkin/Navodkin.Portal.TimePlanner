import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

// ─── Table row types ──────────────────────────────────────────────────────────

export interface MigrationTable {
  filename: string;
  applied_at: ColumnType<Date, string | undefined, never>;
}

export interface RoleTable {
  id: Generated<number>;
  name: string;
}

export interface UserTable {
  id: Generated<string>;
  username: string;
  password_hash: string | null;
  role_id: number;
  avatar_speaking: string | null;
  avatar_silent: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  oidc_sub: string | null;
  oidc_provider: string | null;
  avatar_url: string | null;
  profile_sync: ColumnType<boolean, boolean | undefined, boolean>;
}

export interface RoomTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  created_by: string | null;
  is_private: boolean;
  password: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface RoomRoleTable {
  id: Generated<string>;
  room_id: string;
  name: string;
  color: string;
  is_default: boolean;
  permissions: ColumnType<RolePermissions, string, string>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface RoomMemberTable {
  room_id: string;
  user_id: string;
  room_role: string;
  role_id: string | null;
  joined_at: ColumnType<Date, string | undefined, never>;
}

// ─── JSONB shapes ─────────────────────────────────────────────────────────────

export interface RolePermissions {
  canMic: boolean;
  canCamera: boolean;
  canScreenShare: boolean;
  canChat: boolean;
  canFileShare: boolean;
  canDrawing: boolean;
  canListenRadio: boolean;
  canManageRadio: boolean;
  canKick: boolean;
  canMute: boolean;
  canBan: boolean;
  canManageRoom: boolean;
  canManageRoles: boolean;
}

// ─── Kysely Database interface ────────────────────────────────────────────────

export interface RoomBanTable {
  room_id: string;
  user_id: string;
  banned_by: string;
  banned_at: ColumnType<Date, string | undefined, never>;
}

export interface AppBanTable {
  user_id: string;
  banned_by: string;
  reason: string | null;
  banned_at: ColumnType<Date, string | undefined, never>;
}

export interface AuthSessionTable {
  id: string;
  user_id: string;
  auth_source: "local" | "oidc";
  keycloak_sid: string | null;
  keycloak_sub: string | null;
  refresh_hash: string;
  created_at: ColumnType<Date, string | undefined, never>;
  last_seen_at: ColumnType<Date | null, string | Date | null | undefined, string | Date | null | undefined>;
  expires_at: ColumnType<Date, string | Date | undefined, string | Date | undefined>;
  revoked_at: ColumnType<Date | null, string | Date | null | undefined, string | Date | null | undefined>;
  revoke_reason: string | null;
}

export interface OidcSettingsTable {
  id: number;
  enabled: boolean;
  provider_name: string;
  issuer: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scope: string;
  username_claim: string;
  avatar_claim: string;
  updated_at: ColumnType<Date, string | Date | undefined, never>;
}

export interface BrandingThemeColors {
  brand: string;
  bgBase: string;
  bgFloat: string;
  bgElevated: string;
  bgModifier: string;
  textPrimary: string;
  textBody: string;
  textSecondary: string;
  textMuted: string;
}

export interface BrandingSettingsTable {
  id: number;
  app_name: string;
  html_title: string;
  tagline: string;
  logo_url: string;
  favicon_url: string;
  background_url: string | null;
  theme_colors: ColumnType<BrandingThemeColors, BrandingThemeColors | string, BrandingThemeColors | string>;
  updated_at: ColumnType<Date, string | Date | undefined, never>;
}

export type AppLogLevel = "debug" | "info" | "warn" | "error";

export interface AppLogTable {
  id: Generated<number>;
  created_at: ColumnType<Date, string | Date | undefined, never>;
  level: AppLogLevel;
  scope: string;
  message: string;
  meta: ColumnType<Record<string, unknown> | null, Record<string, unknown> | string | null | undefined, Record<string, unknown> | string | null>;
  source: string;
  user_id: string | null;
  username: string | null;
  trace_id: string | null;
}

export interface Database {
  migrations: MigrationTable;
  roles: RoleTable;
  users: UserTable;
  rooms: RoomTable;
  room_roles: RoomRoleTable;
  room_members: RoomMemberTable;
  room_bans: RoomBanTable;
  app_bans: AppBanTable;
  auth_sessions: AuthSessionTable;
  oidc_settings: OidcSettingsTable;
  branding_settings: BrandingSettingsTable;
  app_logs: AppLogTable;
}

// ─── Selectable / Insertable / Updateable helpers ─────────────────────────────

export type Role = Selectable<RoleTable>;
export type NewRole = Insertable<RoleTable>;

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;

export type Room = Selectable<RoomTable>;
export type NewRoom = Insertable<RoomTable>;
export type RoomUpdate = Updateable<RoomTable>;

export type RoomRole = Selectable<RoomRoleTable>;
export type NewRoomRole = Insertable<RoomRoleTable>;
export type RoomRoleUpdate = Updateable<RoomRoleTable>;

export type RoomMember = Selectable<RoomMemberTable>;
export type NewRoomMember = Insertable<RoomMemberTable>;
export type RoomMemberUpdate = Updateable<RoomMemberTable>;

export type RoomBan = Selectable<RoomBanTable>;
export type NewRoomBan = Insertable<RoomBanTable>;

export type AppBan = Selectable<AppBanTable>;
export type NewAppBan = Insertable<AppBanTable>;

export type AuthSession = Selectable<AuthSessionTable>;
export type NewAuthSession = Insertable<AuthSessionTable>;
export type AuthSessionUpdate = Updateable<AuthSessionTable>;

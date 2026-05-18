export interface RoleDto {
  id: number;
  name: string;
}

export interface UserDto {
  id: string;
  username: string;
  roleId: number;
  roleName: string;
  createdAt: Date;
  oidcProvider: string | null;
  avatarUrl: string | null;
}

export interface UserFilters {
  roleId?: number;
  search?: string;
}

export interface CreateUserData {
  username: string;
  passwordHash: string | null;
  roleId: number;
  oidcSub?: string;
  oidcProvider?: string;
  avatarUrl?: string | null;
}

export interface UpdateUserOidcData {
  username?: string;
  avatarUrl?: string | null;
}

export type AuthSource = "local" | "oidc";

export interface AuthSessionDto {
  id: string;
  userId: string;
  authSource: AuthSource;
  keycloakSid: string | null;
  keycloakSub: string | null;
  refreshHash: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
}

export interface CreateAuthSessionData {
  id: string;
  userId: string;
  authSource: AuthSource;
  keycloakSid?: string | null;
  keycloakSub?: string | null;
  refreshHash: string;
  expiresAt: Date;
}

export interface RotateAuthSessionData {
  sessionId: string;
  previousRefreshHash: string;
  refreshHash: string;
  expiresAt: Date;
}

import { db } from "../../../shared/db/database.js";
import type { IAuthReadContext } from "./interfaces.js";
import type { UserDto, RoleDto, UserFilters, AuthSessionDto } from "./dto.js";

export class AuthReadDataContext implements IAuthReadContext {
  async getUserById(id: string): Promise<UserDto | null> {
    const row = await db
      .selectFrom("users as u")
      .innerJoin("roles as r", "r.id", "u.role_id")
      .select(["u.id", "u.username", "u.role_id", "r.name as role_name", "u.created_at", "u.oidc_provider", "u.avatar_url"])
      .where("u.id", "=", id)
      .executeTakeFirst();
    return row ? mapUser(row) : null;
  }

  async getUserByUsername(username: string): Promise<UserDto | null> {
    const row = await db
      .selectFrom("users as u")
      .innerJoin("roles as r", "r.id", "u.role_id")
      .select(["u.id", "u.username", "u.role_id", "r.name as role_name", "u.created_at", "u.oidc_provider", "u.avatar_url"])
      .where("u.username", "=", username)
      .executeTakeFirst();
    return row ? mapUser(row) : null;
  }

  async findUserByOidc(provider: string, sub: string): Promise<UserDto | null> {
    const row = await db
      .selectFrom("users as u")
      .innerJoin("roles as r", "r.id", "u.role_id")
      .select(["u.id", "u.username", "u.role_id", "r.name as role_name", "u.created_at", "u.oidc_provider", "u.avatar_url"])
      .where("u.oidc_provider", "=", provider)
      .where("u.oidc_sub", "=", sub)
      .executeTakeFirst();
    return row ? mapUser(row) : null;
  }

  async getAuthSessionById(id: string): Promise<AuthSessionDto | null> {
    const row = await db
      .selectFrom("auth_sessions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? mapAuthSession(row) : null;
  }

  async getActiveAuthSessionsByKeycloakSid(sid: string): Promise<AuthSessionDto[]> {
    const rows = await db
      .selectFrom("auth_sessions")
      .selectAll()
      .where("keycloak_sid", "=", sid)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .execute();
    return rows.map(mapAuthSession);
  }

  async getActiveAuthSessionsByKeycloakSub(sub: string): Promise<AuthSessionDto[]> {
    const rows = await db
      .selectFrom("auth_sessions")
      .selectAll()
      .where("keycloak_sub", "=", sub)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .execute();
    return rows.map(mapAuthSession);
  }

  async getUsers(filters?: UserFilters): Promise<UserDto[]> {
    let query = db
      .selectFrom("users as u")
      .innerJoin("roles as r", "r.id", "u.role_id")
      .select(["u.id", "u.username", "u.role_id", "r.name as role_name", "u.created_at", "u.oidc_provider", "u.avatar_url"]);

    if (filters?.roleId !== undefined) {
      query = query.where("u.role_id", "=", filters.roleId);
    }
    if (filters?.search) {
      query = query.where("u.username", "ilike", `%${filters.search}%`);
    }

    const rows = await query.orderBy("u.created_at", "asc").execute();
    return rows.map(mapUser);
  }

  async getRoles(): Promise<RoleDto[]> {
    const rows = await db.selectFrom("roles").selectAll().orderBy("id", "asc").execute();
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async getRoleByName(name: string): Promise<RoleDto | null> {
    const row = await db
      .selectFrom("roles")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();
    return row ? { id: row.id, name: row.name } : null;
  }
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  username: string;
  role_id: number;
  role_name: string;
  created_at: Date;
  oidc_provider: string | null;
  avatar_url: string | null;
};

type AuthSessionRow = {
  id: string;
  user_id: string;
  auth_source: "local" | "oidc";
  keycloak_sid: string | null;
  keycloak_sub: string | null;
  refresh_hash: string;
  created_at: Date;
  last_seen_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
};

function mapUser(row: UserRow): UserDto {
  return {
    id: row.id,
    username: row.username,
    roleId: row.role_id,
    roleName: row.role_name,
    createdAt: row.created_at,
    oidcProvider: row.oidc_provider,
    avatarUrl: row.avatar_url,
  };
}

function mapAuthSession(row: AuthSessionRow): AuthSessionDto {
  return {
    id: row.id,
    userId: row.user_id,
    authSource: row.auth_source,
    keycloakSid: row.keycloak_sid,
    keycloakSub: row.keycloak_sub,
    refreshHash: row.refresh_hash,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}

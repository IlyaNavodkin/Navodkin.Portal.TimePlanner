import { db } from "../../../shared/db/database.js";
import type { IAuthMutateContext } from "./interfaces.js";
import type { UserDto, CreateUserData, UpdateUserOidcData, CreateAuthSessionData, RotateAuthSessionData } from "./dto.js";
import { AuthReadDataContext } from "./ReadDataContext.js";

const read = new AuthReadDataContext();

export class AuthMutateDataContext implements IAuthMutateContext {
  async createUser(data: CreateUserData): Promise<UserDto> {
    const row = await db
      .insertInto("users")
      .values({
        username: data.username,
        password_hash: data.passwordHash,
        role_id: data.roleId,
        oidc_sub: data.oidcSub ?? null,
        oidc_provider: data.oidcProvider ?? null,
        avatar_url: data.avatarUrl ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return (await read.getUserById(row.id))!;
  }

  async updateUserRole(userId: string, roleId: number): Promise<void> {
    await db
      .updateTable("users")
      .set({ role_id: roleId })
      .where("id", "=", userId)
      .execute();
  }

  async updateUserOidc(userId: string, data: UpdateUserOidcData): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (data.username !== undefined) updates.username = data.username;
    if (data.avatarUrl !== undefined) updates.avatar_url = data.avatarUrl;

    if (Object.keys(updates).length === 0) return;

    await db.updateTable("users").set(updates).where("id", "=", userId).execute();
  }

  async createAuthSession(data: CreateAuthSessionData): Promise<void> {
    await db
      .insertInto("auth_sessions")
      .values({
        id: data.id,
        user_id: data.userId,
        auth_source: data.authSource,
        keycloak_sid: data.keycloakSid ?? null,
        keycloak_sub: data.keycloakSub ?? null,
        refresh_hash: data.refreshHash,
        expires_at: data.expiresAt,
      })
      .execute();
  }

  async rotateAuthSession(data: RotateAuthSessionData): Promise<boolean> {
    const result = await db
      .updateTable("auth_sessions")
      .set({
        refresh_hash: data.refreshHash,
        expires_at: data.expiresAt,
        last_seen_at: new Date(),
      })
      .where("id", "=", data.sessionId)
      .where("refresh_hash", "=", data.previousRefreshHash)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0) > 0;
  }

  async touchAuthSession(sessionId: string): Promise<void> {
    await db
      .updateTable("auth_sessions")
      .set({ last_seen_at: new Date() })
      .where("id", "=", sessionId)
      .execute();
  }

  async revokeAuthSession(sessionId: string, reason?: string): Promise<void> {
    await db
      .updateTable("auth_sessions")
      .set({
        revoked_at: new Date(),
        revoke_reason: reason ?? null,
      })
      .where("id", "=", sessionId)
      .where("revoked_at", "is", null)
      .execute();
  }

  async revokeUserAuthSessions(userId: string, reason?: string): Promise<string[]> {
    const rows = await db
      .updateTable("auth_sessions")
      .set({
        revoked_at: new Date(),
        revoke_reason: reason ?? null,
      })
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .returning("id")
      .execute();
    return rows.map((row) => row.id);
  }

  async revokeAuthSessionsByKeycloakSid(sid: string, reason?: string): Promise<string[]> {
    const rows = await db
      .updateTable("auth_sessions")
      .set({
        revoked_at: new Date(),
        revoke_reason: reason ?? null,
      })
      .where("keycloak_sid", "=", sid)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .returning("id")
      .execute();
    return rows.map((row) => row.id);
  }

  async revokeAuthSessionsByKeycloakSub(sub: string, reason?: string): Promise<string[]> {
    const rows = await db
      .updateTable("auth_sessions")
      .set({
        revoked_at: new Date(),
        revoke_reason: reason ?? null,
      })
      .where("keycloak_sub", "=", sub)
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .returning("id")
      .execute();
    return rows.map((row) => row.id);
  }

  async revokeAllAuthSessions(reason?: string): Promise<string[]> {
    const rows = await db
      .updateTable("auth_sessions")
      .set({
        revoked_at: new Date(),
        revoke_reason: reason ?? null,
      })
      .where("revoked_at", "is", null)
      .where("expires_at", ">", new Date())
      .returning("id")
      .execute();
    return rows.map((row) => row.id);
  }

  async deleteUser(userId: string): Promise<void> {
    await db.deleteFrom("users").where("id", "=", userId).execute();
  }
}

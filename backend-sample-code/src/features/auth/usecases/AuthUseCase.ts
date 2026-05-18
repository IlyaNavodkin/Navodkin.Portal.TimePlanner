import bcrypt from "bcrypt";
import crypto from "crypto";
import { authReadCtx as readCtx, authMutateCtx as mutateCtx, type UserDto } from "../data/index.js";
import { adminReadCtx } from "../../admin/data/index.js";
import { issueTokenPair, verifyRefreshToken, hashRefreshToken, decodeTokenExpMs } from "./token.js";
import type { JwtPayload } from "../types.js";

const BCRYPT_ROUNDS = 12;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  token: string; // backward compatibility with existing client fields
  user: UserDto;
}

function makePayload(user: UserDto, sessionId: string): Omit<JwtPayload, "iat" | "exp"> {
  return {
    sub: user.id,
    username: user.username,
    role: user.roleName as JwtPayload["role"],
    jti: sessionId,
  };
}

export class AuthUseCase {
  private async issueSession(user: UserDto, options?: {
    authSource?: "local" | "oidc";
    keycloakSid?: string | null;
    keycloakSub?: string | null;
  }): Promise<AuthResult> {
    const sessionId = crypto.randomUUID();
    const payload = makePayload(user, sessionId);
    const { accessToken, refreshToken } = issueTokenPair(payload);
    await mutateCtx.createAuthSession({
      id: sessionId,
      userId: user.id,
      authSource: options?.authSource ?? "local",
      keycloakSid: options?.keycloakSid ?? null,
      keycloakSub: options?.keycloakSub ?? null,
      refreshHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(decodeTokenExpMs(refreshToken)),
    });
    return { accessToken, refreshToken, token: accessToken, user };
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const row = await readCtx.getUserByUsername(username);
    if (!row) throw new Error("Invalid credentials");

    // Fetch password_hash directly (not exposed in UserDto)
    const raw = await import("../../../shared/db/database.js").then(({ db }) =>
      db.selectFrom("users").select("password_hash").where("username", "=", username).executeTakeFirst()
    );
    if (!raw?.password_hash) throw new Error("Invalid credentials");

    const valid = await bcrypt.compare(password, raw.password_hash);
    if (!valid) throw new Error("Invalid credentials");

    return this.issueSession(row, { authSource: "local" });
  }

  async register(username: string, password: string): Promise<AuthResult> {
    const existing = await readCtx.getUserByUsername(username);
    if (existing) throw new Error("Username already taken");

    const memberRole = await readCtx.getRoleByName("member");
    if (!memberRole) throw new Error("Roles not seeded — run migrations first");

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await mutateCtx.createUser({
      username,
      passwordHash,
      roleId: memberRole.id,
    });

    return this.issueSession(user, { authSource: "local" });
  }

  async issueOidcSession(user: UserDto, keycloakSid?: string | null, keycloakSub?: string | null): Promise<AuthResult> {
    return this.issueSession(user, {
      authSource: "oidc",
      keycloakSid: keycloakSid ?? null,
      keycloakSub: keycloakSub ?? null,
    });
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const refreshPayload = verifyRefreshToken(refreshToken);
    if (refreshPayload.typ !== "refresh" || !refreshPayload.jti) {
      throw new Error("Invalid refresh token");
    }

    const session = await readCtx.getAuthSessionById(refreshPayload.jti);
    if (!session) throw new Error("Session not found");
    if (session.userId !== refreshPayload.sub) throw new Error("Session user mismatch");
    if (session.revokedAt) throw new Error("Session revoked");
    if (session.expiresAt.getTime() <= Date.now()) throw new Error("Session expired");
    const oldRefreshHash = hashRefreshToken(refreshToken);
    if (oldRefreshHash !== session.refreshHash) throw new Error("Refresh token mismatch");

    const user = await readCtx.getUserById(session.userId);
    if (!user) throw new Error("User not found");

    const isBanned = await adminReadCtx.isAppBanned(user.id);
    if (isBanned) {
      await mutateCtx.revokeAuthSession(session.id, "app-ban");
      throw new Error("User banned");
    }

    const payload = makePayload(user, session.id);
    const next = issueTokenPair(payload);
    const rotated = await mutateCtx.rotateAuthSession({
      sessionId: session.id,
      previousRefreshHash: oldRefreshHash,
      refreshHash: hashRefreshToken(next.refreshToken),
      expiresAt: new Date(decodeTokenExpMs(next.refreshToken)),
    });
    if (!rotated) {
      throw new Error("Refresh token mismatch");
    }

    return { accessToken: next.accessToken, refreshToken: next.refreshToken, token: next.accessToken, user };
  }

  async logout(sessionId: string): Promise<void> {
    await mutateCtx.revokeAuthSession(sessionId, "logout");
  }

  async revokeUserSessions(userId: string, reason?: string): Promise<string[]> {
    return mutateCtx.revokeUserAuthSessions(userId, reason);
  }

  async revokeSession(sessionId: string, reason?: string): Promise<void> {
    await mutateCtx.revokeAuthSession(sessionId, reason);
  }

  async revokeOidcSessions(params: { sid?: string; sub?: string; reason?: string }): Promise<string[]> {
    if (params.sid) {
      return mutateCtx.revokeAuthSessionsByKeycloakSid(params.sid, params.reason);
    }
    if (params.sub) {
      return mutateCtx.revokeAuthSessionsByKeycloakSub(params.sub, params.reason);
    }
    return [];
  }

  async revokeAllSessions(reason?: string): Promise<string[]> {
    return mutateCtx.revokeAllAuthSessions(reason);
  }

  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await readCtx.getAuthSessionById(sessionId);
    if (!session) return false;
    if (session.userId !== userId) return false;
    if (session.revokedAt) return false;
    if (session.expiresAt.getTime() <= Date.now()) return false;
    await mutateCtx.touchAuthSession(sessionId);
    return true;
  }
}

export const authUseCase = new AuthUseCase();

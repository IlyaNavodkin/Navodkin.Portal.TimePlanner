import { Issuer, generators, type BaseClient } from "openid-client";
import { db } from "../../../shared/db/database.js";
import { authReadCtx as readCtx, authMutateCtx as mutateCtx } from "../data/index.js";
import { authUseCase, type AuthResult } from "./AuthUseCase.js";
import { getOidcRuntimeConfig, type OidcRuntimeConfig } from "./OidcRuntimeConfig.js";
import type { UserDto } from "../data/dto.js";
import { KEYCLOAK_URL } from "../config.js";

let _client: BaseClient | null = null;
let _clientKey = "";

function buildClientKey(cfg: OidcRuntimeConfig): string {
  return `${cfg.issuer}|${cfg.clientId}|${cfg.clientSecret}|${cfg.redirectUri}|${KEYCLOAK_URL}`;
}

function parseRealmFromIssuer(issuer: string): string | null {
  try {
    const url = new URL(issuer);
    const match = url.pathname.match(/\/realms\/([^/]+)\/?$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildInternalIssuerUrl(cfg: OidcRuntimeConfig): string | null {
  const base = KEYCLOAK_URL.trim();
  if (!base) return null;

  const realm = parseRealmFromIssuer(cfg.issuer);
  if (!realm) return null;

  return `${normalizeBaseUrl(base)}/realms/${encodeURIComponent(realm)}`;
}

async function getClient(cfg: OidcRuntimeConfig): Promise<BaseClient> {
  const key = buildClientKey(cfg);
  if (_client && _clientKey === key) return _client;

  const internalIssuerUrl = buildInternalIssuerUrl(cfg);

  if (internalIssuerUrl) {
    // In Docker, backend-to-Keycloak traffic should use internal DNS while browser flows stay on public issuer.
    const internalIssuer = new Issuer({
      issuer: cfg.issuer.replace(/\/+$/, ""),
      authorization_endpoint: `${cfg.issuer.replace(/\/+$/, "")}/protocol/openid-connect/auth`,
      token_endpoint: `${internalIssuerUrl}/protocol/openid-connect/token`,
      jwks_uri: `${internalIssuerUrl}/protocol/openid-connect/certs`,
      userinfo_endpoint: `${internalIssuerUrl}/protocol/openid-connect/userinfo`,
    });

    _client = new internalIssuer.Client({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uris: [cfg.redirectUri],
      response_types: ["code"],
    });
    _clientKey = key;
    return _client;
  }

  const discoveredIssuer = await Issuer.discover(cfg.issuer);
  _client = new discoveredIssuer.Client({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uris: [cfg.redirectUri],
    response_types: ["code"],
  });
  _clientKey = key;
  return _client;
}

// Resolve username conflicts by appending a numeric suffix
async function resolveUsername(preferred: string): Promise<string> {
  const sanitized = preferred.replace(/[^a-zA-Z0-9_\-\.]/g, "_").slice(0, 80) || "user";
  let candidate = sanitized;
  let attempt = 2;
  while (await readCtx.getUserByUsername(candidate)) {
    candidate = `${sanitized}_${attempt++}`;
  }
  return candidate;
}

export class OidcUseCase {
  private readStringClaim(claims: Record<string, unknown>, claimName: string): string | null {
    const raw = claims[claimName];
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    return value.length > 0 ? value : null;
  }

  generatePkce(): { codeVerifier: string; codeChallenge: string; state: string } {
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();
    return { codeVerifier, codeChallenge, state };
  }

  async getAuthorizationUrl(state: string, codeChallenge: string): Promise<string> {
    const cfg = await getOidcRuntimeConfig();
    if (!cfg.enabled) throw new Error("OIDC is disabled");
    const client = await getClient(cfg);
    return client.authorizationUrl({
      scope: cfg.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
  }

  async handleCallback(
    params: Record<string, string>,
    expectedState: string,
    codeVerifier: string
  ): Promise<AuthResult> {
    const cfg = await getOidcRuntimeConfig();
    if (!cfg.enabled) throw new Error("OIDC is disabled");
    const client = await getClient(cfg);

    const tokenSet = await client.callback(cfg.redirectUri, params, {
      state: expectedState,
      code_verifier: codeVerifier,
    });

    const claims = tokenSet.claims() as Record<string, unknown>;
    const sub = this.readStringClaim(claims, "sub");
    if (!sub) {
      throw new Error("OIDC token missing required 'sub' claim");
    }
    const preferredUsername = this.readStringClaim(claims, cfg.usernameClaim) || `user_${sub.slice(0, 8)}`;
    const pictureUrl = this.readStringClaim(claims, cfg.avatarClaim);

    let user = await readCtx.findUserByOidc(cfg.providerName, sub);

    if (user) {
      // Check profile_sync flag
      const raw = await db
        .selectFrom("users")
        .select("profile_sync")
        .where("id", "=", user.id)
        .executeTakeFirst();

      if (raw?.profile_sync) {
        // Check if the new username is different and not taken by another user
        const existingByUsername = await readCtx.getUserByUsername(preferredUsername);
        const usernameToSet = (!existingByUsername || existingByUsername.id === user.id)
          ? preferredUsername
          : user.username;

        await mutateCtx.updateUserOidc(user.id, {
          username: usernameToSet,
          avatarUrl: pictureUrl,
        });
        user = (await readCtx.getUserById(user.id))!;
      }
    } else {
      // New SSO user — JIT-provision
      const memberRole = await readCtx.getRoleByName("member");
      if (!memberRole) throw new Error("Roles not seeded — run migrations first");

      const username = await resolveUsername(preferredUsername);
      user = await mutateCtx.createUser({
        username,
        passwordHash: null,
        roleId: memberRole.id,
        oidcSub: sub,
        oidcProvider: cfg.providerName,
        avatarUrl: pictureUrl,
      });
    }

    const sid = typeof claims.sid === "string" ? claims.sid : null;
    return authUseCase.issueOidcSession(user, sid, sub);
  }
}

export const oidcUseCase = new OidcUseCase();

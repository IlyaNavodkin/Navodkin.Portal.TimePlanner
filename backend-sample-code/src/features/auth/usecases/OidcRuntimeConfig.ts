import { db } from "../../../shared/db/database.js";
import {
  OIDC_ENABLED,
  OIDC_PROVIDER_NAME,
  OIDC_ISSUER,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_REDIRECT_URI,
  OIDC_SCOPE,
  OIDC_USERNAME_CLAIM,
  OIDC_AVATAR_CLAIM,
} from "../config.js";

export interface OidcRuntimeConfig {
  enabled: boolean;
  providerName: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  usernameClaim: string;
  avatarClaim: string;
}

export interface OidcRuntimeConfigPatch {
  enabled?: boolean;
  providerName?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scope?: string;
  usernameClaim?: string;
  avatarClaim?: string;
}

const DEFAULT_CONFIG: OidcRuntimeConfig = {
  enabled: OIDC_ENABLED,
  providerName: OIDC_PROVIDER_NAME,
  issuer: OIDC_ISSUER,
  clientId: OIDC_CLIENT_ID,
  clientSecret: OIDC_CLIENT_SECRET,
  redirectUri: OIDC_REDIRECT_URI,
  scope: OIDC_SCOPE,
  usernameClaim: OIDC_USERNAME_CLAIM,
  avatarClaim: OIDC_AVATAR_CLAIM,
};

let cached: OidcRuntimeConfig = { ...DEFAULT_CONFIG };
let loaded = false;

function normalize(input: OidcRuntimeConfig): OidcRuntimeConfig {
  return {
    enabled: !!input.enabled,
    providerName: input.providerName.trim(),
    issuer: input.issuer.trim(),
    clientId: input.clientId.trim(),
    clientSecret: input.clientSecret,
    redirectUri: input.redirectUri.trim(),
    scope: input.scope.trim() || "openid profile email",
    usernameClaim: input.usernameClaim.trim() || "preferred_username",
    avatarClaim: input.avatarClaim.trim() || "picture",
  };
}

function isMissingTableError(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return code === "42P01";
}

function assertConfigured(cfg: OidcRuntimeConfig): void {
  if (!cfg.enabled) return;
  if (!cfg.providerName) throw new Error("OIDC provider name is required");
  if (!cfg.issuer) throw new Error("OIDC issuer is required");
  if (!cfg.clientId) throw new Error("OIDC clientId is required");
  if (!cfg.clientSecret) throw new Error("OIDC clientSecret is required");
  if (!cfg.redirectUri) throw new Error("OIDC redirectUri is required");
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;

  try {
    const row = await db
      .selectFrom("oidc_settings")
      .selectAll()
      .where("id", "=", 1)
      .executeTakeFirst();

    if (row) {
      cached = normalize({
        enabled: row.enabled,
        providerName: row.provider_name,
        issuer: row.issuer,
        clientId: row.client_id,
        clientSecret: row.client_secret,
        redirectUri: row.redirect_uri,
        scope: row.scope,
        usernameClaim: row.username_claim ?? "preferred_username",
        avatarClaim: row.avatar_claim ?? "picture",
      });
      loaded = true;
      return;
    }

    const seed = normalize(DEFAULT_CONFIG);
    await db
      .insertInto("oidc_settings")
      .values({
        id: 1,
        enabled: seed.enabled,
        provider_name: seed.providerName,
        issuer: seed.issuer,
        client_id: seed.clientId,
        client_secret: seed.clientSecret,
        redirect_uri: seed.redirectUri,
        scope: seed.scope,
        username_claim: seed.usernameClaim,
        avatar_claim: seed.avatarClaim,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
    cached = seed;
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    cached = normalize(DEFAULT_CONFIG);
  } finally {
    loaded = true;
  }
}

export async function getOidcRuntimeConfig(): Promise<OidcRuntimeConfig> {
  await ensureLoaded();
  return { ...cached };
}

export async function updateOidcRuntimeConfig(patch: OidcRuntimeConfigPatch): Promise<OidcRuntimeConfig> {
  await ensureLoaded();

  const next = normalize({
    ...cached,
    ...patch,
  });
  assertConfigured(next);

  try {
    await db
      .insertInto("oidc_settings")
      .values({
        id: 1,
        enabled: next.enabled,
        provider_name: next.providerName,
        issuer: next.issuer,
        client_id: next.clientId,
        client_secret: next.clientSecret,
        redirect_uri: next.redirectUri,
        scope: next.scope,
        username_claim: next.usernameClaim,
        avatar_claim: next.avatarClaim,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          enabled: next.enabled,
          provider_name: next.providerName,
          issuer: next.issuer,
          client_id: next.clientId,
          client_secret: next.clientSecret,
          redirect_uri: next.redirectUri,
          scope: next.scope,
          username_claim: next.usernameClaim,
          avatar_claim: next.avatarClaim,
        }))
      .execute();
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new Error("OIDC settings table is missing. Apply DB migrations first.");
    }
    throw err;
  }

  cached = next;
  return { ...cached };
}

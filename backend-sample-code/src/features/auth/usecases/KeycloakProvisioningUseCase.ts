import {
  KEYCLOAK_ADMIN_PASSWORD,
  KEYCLOAK_ADMIN_USER,
  KEYCLOAK_URL,
  KEYCLOAK_REALM,
} from "../config.js";
import { createLogger } from "../../../shared/logger.js";
import { getOidcRuntimeConfig, type OidcRuntimeConfig } from "./OidcRuntimeConfig.js";

type ProvisionStatus = "skipped" | "applied";

export interface KeycloakProvisionResult {
  status: ProvisionStatus;
  message: string;
  realm?: string;
  clientId?: string;
}

interface KeycloakDerivedConfig {
  adminBaseUrl: string;
  realm: string;
}

interface KeycloakClientRepresentation {
  id?: string;
  clientId: string;
  name: string;
  protocol: "openid-connect";
  enabled: boolean;
  publicClient: boolean;
  secret: string;
  standardFlowEnabled: boolean;
  directAccessGrantsEnabled: boolean;
  redirectUris: string[];
  webOrigins: string[];
  attributes: Record<string, string>;
}

const logger = createLogger("keycloak-provision");

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}

function parseIssuer(issuer: string): KeycloakDerivedConfig {
  const url = new URL(issuer);
  const match = url.pathname.match(/^(.*)\/realms\/([^/]+)\/?$/);
  if (!match) {
    throw new Error(`OIDC issuer must contain '/realms/<realm>': ${issuer}`);
  }

  const issuerBasePath = match[1] || "";
  const realmFromIssuer = decodeURIComponent(match[2] ?? "");
  if (!realmFromIssuer) throw new Error("Cannot resolve realm from OIDC issuer");

  const adminBaseUrl = normalizeBaseUrl(
    KEYCLOAK_URL.trim() || `${url.origin}${issuerBasePath}`,
  );

  return {
    adminBaseUrl,
    realm: KEYCLOAK_REALM.trim() || realmFromIssuer,
  };
}

function originFromRedirectUri(redirectUri: string): string {
  return new URL(redirectUri).origin;
}

function asSet(values: string[]): string[] {
  return [...new Set(values)];
}

function buildClient(cfg: OidcRuntimeConfig): KeycloakClientRepresentation {
  const appOrigin = originFromRedirectUri(cfg.redirectUri);
  const logoutUris = asSet([
    "http://localhost:3000/login",
    "http://localhost:3000/*",
    `${appOrigin}/login`,
    `${appOrigin}/*`,
  ]).join("##");

  return {
    clientId: cfg.clientId,
    name: "Koster Web",
    protocol: "openid-connect",
    enabled: true,
    publicClient: false,
    secret: cfg.clientSecret,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    redirectUris: asSet([
      "http://localhost:3001/api/auth/oidc/callback",
      "http://localhost/api/auth/oidc/callback",
      "https://localhost:8443/api/auth/oidc/callback",
      cfg.redirectUri,
    ]),
    webOrigins: asSet([
      "http://localhost:3000",
      "http://localhost",
      "https://localhost:8443",
      appOrigin,
    ]),
    attributes: {
      "pkce.code.challenge.method": "S256",
      "post.logout.redirect.uris": logoutUris,
    },
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(adminBaseUrl: string): Promise<void> {
  const maxAttempts = 40;
  const readyUrl = `${adminBaseUrl}/realms/master/.well-known/openid-configuration`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(readyUrl);
      if (response.ok) return;
    } catch {
      // retry
    }
    await sleep(1500);
  }

  throw new Error(`Keycloak is not ready: ${readyUrl}`);
}

async function requestAdminToken(adminBaseUrl: string): Promise<string> {
  const username = KEYCLOAK_ADMIN_USER.trim();
  const password = KEYCLOAK_ADMIN_PASSWORD.trim();
  if (!username || !password) {
    throw new Error("KEYCLOAK_ADMIN_USER and KEYCLOAK_ADMIN_PASSWORD are required for OIDC provisioning");
  }

  const tokenUrl = `${adminBaseUrl}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    client_id: "admin-cli",
    grant_type: "password",
    username,
    password,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Cannot get Keycloak admin token: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Keycloak token response has no access_token");
  return json.access_token;
}

async function kcFetch(
  adminBaseUrl: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${adminBaseUrl}${path}`, { ...init, headers });
}

async function ensureRealm(adminBaseUrl: string, token: string, realm: string): Promise<void> {
  const getResponse = await kcFetch(adminBaseUrl, token, `/admin/realms/${encodeURIComponent(realm)}`);
  if (getResponse.ok) return;
  if (getResponse.status !== 404) {
    throw new Error(`Cannot query realm '${realm}': HTTP ${getResponse.status}`);
  }

  const createResponse = await kcFetch(adminBaseUrl, token, "/admin/realms", {
    method: "POST",
    body: JSON.stringify({
      realm,
      enabled: true,
      displayName: "Koster",
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Cannot create realm '${realm}': HTTP ${createResponse.status}`);
  }
}

async function ensureClient(
  adminBaseUrl: string,
  token: string,
  realm: string,
  client: KeycloakClientRepresentation,
): Promise<void> {
  const queryPath =
    `/admin/realms/${encodeURIComponent(realm)}/clients?clientId=${encodeURIComponent(client.clientId)}`;
  const queryResponse = await kcFetch(adminBaseUrl, token, queryPath);
  if (!queryResponse.ok) {
    throw new Error(`Cannot query client '${client.clientId}': HTTP ${queryResponse.status}`);
  }

  const clients = (await queryResponse.json()) as Array<{ id?: string }>;
  const existingId = clients[0]?.id;

  if (!existingId) {
    const createPath = `/admin/realms/${encodeURIComponent(realm)}/clients`;
    const createResponse = await kcFetch(adminBaseUrl, token, createPath, {
      method: "POST",
      body: JSON.stringify(client),
    });
    if (!createResponse.ok) {
      throw new Error(`Cannot create client '${client.clientId}': HTTP ${createResponse.status}`);
    }
    return;
  }

  const updatePath = `/admin/realms/${encodeURIComponent(realm)}/clients/${encodeURIComponent(existingId)}`;
  const updateResponse = await kcFetch(adminBaseUrl, token, updatePath, {
    method: "PUT",
    body: JSON.stringify({ ...client, id: existingId }),
  });

  if (!updateResponse.ok) {
    throw new Error(`Cannot update client '${client.clientId}': HTTP ${updateResponse.status}`);
  }
}

export class KeycloakProvisioningUseCase {
  async ensureFromRuntimeConfig(): Promise<KeycloakProvisionResult> {
    const cfg = await getOidcRuntimeConfig();

    if (!cfg.enabled) {
      return { status: "skipped", message: "OIDC is disabled" };
    }

    const { adminBaseUrl, realm } = parseIssuer(cfg.issuer);
    const client = buildClient(cfg);

    logger.info("Provisioning Keycloak realm/client", {
      realm,
      clientId: client.clientId,
      adminBaseUrl,
    });

    await waitForReady(adminBaseUrl);
    const token = await requestAdminToken(adminBaseUrl);
    await ensureRealm(adminBaseUrl, token, realm);
    await ensureClient(adminBaseUrl, token, realm, client);

    return {
      status: "applied",
      message: "Keycloak realm/client ensured",
      realm,
      clientId: client.clientId,
    };
  }
}

export const keycloakProvisioningUseCase = new KeycloakProvisioningUseCase();

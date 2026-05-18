import { config as dotenvConfig } from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_DEV = process.env.NODE_ENV !== "production";

// Dev: load .env from monorepo root.
if (IS_DEV) {
  const envPath = path.resolve(__dirname, "../../../.env");
  dotenvConfig({ path: envPath });
}

function readEnv(primary: string, legacy?: string): string | undefined {
  const direct = process.env[primary];
  if (typeof direct === "string" && direct.length > 0) return direct;
  if (!legacy) return undefined;
  const fallback = process.env[legacy];
  if (typeof fallback === "string" && fallback.length > 0) return fallback;
  return undefined;
}

const REQUIRED_MAP = [
  { primary: "LIVEKIT_API_KEY", legacy: "LK_API_KEY" },
  { primary: "LIVEKIT_API_SECRET", legacy: "LK_API_SECRET" },
  { primary: "SERVER_DB_PASSWORD", legacy: "DB_PASSWORD" },
  { primary: "SERVER_JWT_SECRET", legacy: "JWT_SECRET" },
  { primary: "SERVER_JWT_ACCESS_EXPIRES", legacy: "JWT_ACCESS_EXPIRES" },
  { primary: "SERVER_JWT_REFRESH_EXPIRES", legacy: "JWT_REFRESH_EXPIRES" },
  { primary: "SERVER_MIGRATE_SECRET", legacy: "MIGRATE_SECRET" },
] as const;

const missing = REQUIRED_MAP
  .filter(({ primary, legacy }) => !readEnv(primary, legacy))
  .map(({ primary, legacy }) => `${primary} (fallback: ${legacy})`);

if (missing.length) {
  const hint = IS_DEV
    ? "  Hint: check .env in monorepo root"
    : "  Hint: pass required variables via Docker/runtime environment";
  console.error(`\n[config] Missing required environment variables:\n${missing.map((k) => `  - ${k}`).join("\n")}\n${hint}\n`);
  process.exit(1);
}

function required(primary: string, legacy?: string): string {
  const value = readEnv(primary, legacy);
  if (!value) {
    throw new Error(`[config] Missing required environment variable: ${primary}${legacy ? ` (fallback: ${legacy})` : ""}`);
  }
  return value;
}

function readBoolean(primary: string, legacy: string, fallback: boolean): boolean {
  const raw = readEnv(primary, legacy);
  if (!raw) return fallback;
  return raw.toLowerCase() === "true";
}

function readNumber(primary: string, legacy: string, fallback: number): number {
  const raw = readEnv(primary, legacy);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readPositiveNumber(primary: string, legacy: string, fallback: number): number {
  const parsed = readNumber(primary, legacy, fallback);
  return parsed > 0 ? parsed : fallback;
}

export const PORT = Number(process.env.PORT) || 3001;

export const RADIO_DIR = path.join(__dirname, "..", "..", "radio");
if (!fs.existsSync(RADIO_DIR)) fs.mkdirSync(RADIO_DIR, { recursive: true });

export const BRANDING_DIR = path.join(__dirname, "..", "..", "branding");
if (!fs.existsSync(BRANDING_DIR)) fs.mkdirSync(BRANDING_DIR, { recursive: true });

// LiveKit
export const LK_URL = readEnv("SERVER_LK_URL", "LK_URL") || "ws://livekit:7880";
export const LK_URL_PUBLIC = readEnv("SERVER_LK_URL_CLIENT", "LK_URL_PUBLIC") || LK_URL;
export const LK_API_KEY = required("LIVEKIT_API_KEY", "LK_API_KEY");
export const LK_API_SECRET = required("LIVEKIT_API_SECRET", "LK_API_SECRET");

// PostgreSQL
export const DB_HOST = readEnv("SERVER_DB_HOST", "DB_HOST") || "localhost";
export const DB_PORT = readNumber("SERVER_DB_PORT", "DB_PORT", 5432);
export const DB_NAME = readEnv("SERVER_DB_NAME", "DB_NAME") || "koster";
export const DB_USER = readEnv("SERVER_DB_USER", "DB_USER") || "koster";
export const DB_PASSWORD = required("SERVER_DB_PASSWORD", "DB_PASSWORD");

// Auth
export const JWT_SECRET = required("SERVER_JWT_SECRET", "JWT_SECRET");
export const JWT_ACCESS_EXPIRES = required("SERVER_JWT_ACCESS_EXPIRES", "JWT_ACCESS_EXPIRES");
export const JWT_REFRESH_EXPIRES = required("SERVER_JWT_REFRESH_EXPIRES", "JWT_REFRESH_EXPIRES");

// Migrations
export const MIGRATE_SECRET = required("SERVER_MIGRATE_SECRET", "MIGRATE_SECRET");

// OIDC (optional - disabled by default)
export const OIDC_ENABLED = readBoolean("SERVER_OIDC_ENABLED", "OIDC_ENABLED", false);
export const OIDC_PROVIDER_NAME = readEnv("SERVER_OIDC_PROVIDER_NAME", "OIDC_PROVIDER_NAME") || "";
export const OIDC_ISSUER = readEnv("SERVER_OIDC_ISSUER", "OIDC_ISSUER") || "";
export const OIDC_CLIENT_ID = readEnv("SERVER_OIDC_CLIENT_ID", "OIDC_CLIENT_ID") || "";
export const OIDC_CLIENT_SECRET = readEnv("SERVER_OIDC_CLIENT_SECRET", "OIDC_CLIENT_SECRET") || "";
export const OIDC_REDIRECT_URI = readEnv("SERVER_OIDC_REDIRECT_URI", "OIDC_REDIRECT_URI") || "";
export const OIDC_SCOPE = readEnv("SERVER_OIDC_SCOPE", "OIDC_SCOPE") || "openid profile email";
export const OIDC_USERNAME_CLAIM = readEnv("SERVER_OIDC_USERNAME_CLAIM", "OIDC_USERNAME_CLAIM") || "preferred_username";
export const OIDC_AVATAR_CLAIM = readEnv("SERVER_OIDC_AVATAR_CLAIM", "OIDC_AVATAR_CLAIM") || "picture";
export const KEYCLOAK_ADMIN_USER = readEnv("SERVER_KEYCLOAK_ADMIN_USER", "KEYCLOAK_ADMIN_USER") || "";
export const KEYCLOAK_ADMIN_PASSWORD = readEnv("SERVER_KEYCLOAK_ADMIN_PASSWORD", "KEYCLOAK_ADMIN_PASSWORD") || "";
export const KEYCLOAK_URL = readEnv("SERVER_KEYCLOAK_URL", "KEYCLOAK_URL") || "";
export const KEYCLOAK_REALM = readEnv("SERVER_KEYCLOAK_REALM", "KEYCLOAK_REALM") || "";

// Client base URL (for redirects after OIDC callback)
export const CLIENT_BASE_URL = readEnv("SERVER_CLIENT_BASE_URL", "CLIENT_BASE_URL") || "http://localhost:5173";

// Migrations SQL dir (works for both ts and compiled dist)
export const MIGRATIONS_DIR = path.join(__dirname, "db", "migrations");
export const LOG_RETENTION_DAYS = readPositiveNumber("SERVER_LOG_RETENTION_DAYS", "LOG_RETENTION_DAYS", 90);
export const LOG_RETENTION_INTERVAL_MINUTES = readPositiveNumber("SERVER_LOG_RETENTION_INTERVAL_MINUTES", "LOG_RETENTION_INTERVAL_MINUTES", 60);
export const LOG_RETENTION_BATCH_SIZE = readPositiveNumber("SERVER_LOG_RETENTION_BATCH_SIZE", "LOG_RETENTION_BATCH_SIZE", 5000);

// Startup env dump
console.log("[config] Loaded environment:");
console.log(`  NODE_ENV       = ${process.env.NODE_ENV ?? "(unset)"}`);
console.log(`  PORT           = ${PORT}`);
console.log(`  LK_URL         = ${LK_URL}`);
console.log(`  LK_URL_PUBLIC  = ${LK_URL_PUBLIC}`);
console.log(`  LK_API_KEY     = ${LK_API_KEY}`);
console.log(`  LK_API_SECRET  = ${LK_API_SECRET}`);
console.log(`  DB_HOST        = ${DB_HOST}`);
console.log(`  DB_PORT        = ${DB_PORT}`);
console.log(`  DB_NAME        = ${DB_NAME}`);
console.log(`  DB_USER        = ${DB_USER}`);
console.log(`  DB_PASSWORD    = ${DB_PASSWORD}`);
console.log(`  JWT_SECRET     = ${JWT_SECRET}`);
console.log(`  MIGRATE_SECRET = ${MIGRATE_SECRET}`);


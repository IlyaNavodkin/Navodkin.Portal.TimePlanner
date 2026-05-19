import { Pool } from "pg"

const DEFAULT_POSTGRES_PORT = 5432

let poolSingleton: Pool | null = null

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function readPostgresHost(): string {
  const host = readRequiredEnv("POSTGRES_HOST")
  // Avoid IPv6 localhost (::1) resolution issues on local dev machines.
  return host.toLowerCase() === "localhost" ? "127.0.0.1" : host
}

function readPort(): number {
  const rawValue = process.env.POSTGRES_PORT ?? String(DEFAULT_POSTGRES_PORT)
  const parsed = Number(rawValue)
  if (Number.isNaN(parsed)) {
    throw new Error(`POSTGRES_PORT must be a number, got: ${rawValue}`)
  }
  return parsed
}

export function getPgPool(): Pool {
  if (poolSingleton) {
    return poolSingleton
  }

  poolSingleton = new Pool({
    host: readPostgresHost(),
    port: readPort(),
    database: readRequiredEnv("POSTGRES_DB"),
    user: readRequiredEnv("POSTGRES_USER"),
    password: readRequiredEnv("POSTGRES_PASSWORD"),
    max: Number(process.env.POSTGRES_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS ?? 30000),
  })

  return poolSingleton
}

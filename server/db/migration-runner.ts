import { access, readdir, readFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import path from "node:path"
import { Pool } from "pg"

import { getPgPool } from "../core/db/pg.ts"

const MIGRATIONS_TABLE = "schema_migrations"
const MIGRATION_FILE_PATTERN = /^(\d+)_([a-z0-9_-]+)\.(up|down)\.sql$/i

type MigrationDirection = "up" | "down"

interface ParsedMigrationFile {
  version: number
  name: string
  direction: MigrationDirection
  fileName: string
}

interface MigrationDefinition {
  version: number
  name: string
  upFileName: string
  downFileName: string
}

const DEFAULT_BOOTSTRAP_RETRY_ATTEMPTS = 15
const DEFAULT_BOOTSTRAP_RETRY_DELAY_MS = 1000

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

function readPostgresPort(): number {
  const raw = process.env.POSTGRES_PORT?.trim() || "5432"
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`POSTGRES_PORT must be a number, got: ${raw}`)
  }
  return parsed
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) {
    return fallback
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`)
  }

  return parsed
}

function quotePgIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function isDuplicateDatabaseError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P04"
  )
}

function isConnectionRefusedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ECONNREFUSED"
  )
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function ensureDatabaseExistsFromEnv(): Promise<void> {
  const targetDatabase = readRequiredEnv("POSTGRES_DB")
  const bootstrapDatabase = process.env.POSTGRES_BOOTSTRAP_DB?.trim() || "postgres"
  const host = readPostgresHost()
  const port = readPostgresPort()
  const retryAttempts = readPositiveIntEnv("POSTGRES_BOOTSTRAP_RETRY_ATTEMPTS", DEFAULT_BOOTSTRAP_RETRY_ATTEMPTS)
  const retryDelayMs = readPositiveIntEnv("POSTGRES_BOOTSTRAP_RETRY_DELAY_MS", DEFAULT_BOOTSTRAP_RETRY_DELAY_MS)

  if (targetDatabase === bootstrapDatabase) {
    return
  }

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const bootstrapPool = new Pool({
      host,
      port,
      database: bootstrapDatabase,
      user: readRequiredEnv("POSTGRES_USER"),
      password: readRequiredEnv("POSTGRES_PASSWORD"),
      max: 1,
      idleTimeoutMillis: 5000,
    })

    try {
      const existsResult = await bootstrapPool.query<{ exists: boolean }>(
        "select exists(select 1 from pg_database where datname = $1) as exists",
        [targetDatabase],
      )

      if (existsResult.rows[0]?.exists) {
        return
      }

      try {
        await bootstrapPool.query(`create database ${quotePgIdentifier(targetDatabase)}`)
        console.log(`[migrate] created database ${targetDatabase}`)
      } catch (error) {
        if (!isDuplicateDatabaseError(error)) {
          throw error
        }
      }
      return
    } catch (error) {
      if (!isConnectionRefusedError(error) || attempt >= retryAttempts) {
        throw error
      }

      console.warn(
        `[migrate] postgres is unavailable at ${host}:${port}, retry ${attempt}/${retryAttempts} in ${retryDelayMs}ms`,
      )
      await wait(retryDelayMs)
    } finally {
      await bootstrapPool.end().catch(() => undefined)
    }
  }
}

async function resolveMigrationsDir(): Promise<string> {
  const candidates: string[] = []

  if (process.env.MIGRATIONS_DIR?.trim()) {
    candidates.push(path.resolve(process.env.MIGRATIONS_DIR.trim()))
  }

  candidates.push(path.resolve(process.cwd(), "server", "db", "migrations"))
  candidates.push(path.resolve(process.cwd(), "db", "migrations"))

  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.R_OK)
      return candidate
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    `[migrate] migrations directory not found. Tried: ${candidates.join(", ")}. ` +
      "Set MIGRATIONS_DIR env variable explicitly if needed.",
  )
}

function parseMigrationFileName(fileName: string): ParsedMigrationFile | null {
  const match = MIGRATION_FILE_PATTERN.exec(fileName)
  if (!match) {
    return null
  }

  const [, rawVersion, rawName, rawDirection] = match
  const version = Number(rawVersion)
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error(`[migrate] invalid migration version in file: ${fileName}`)
  }

  return {
    version,
    name: rawName.toLowerCase(),
    direction: rawDirection.toLowerCase() as MigrationDirection,
    fileName,
  }
}

async function readMigrationDefinitions(migrationsDir: string): Promise<MigrationDefinition[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true })
  const byVersion = new Map<number, { name: string; upFileName?: string; downFileName?: string }>()

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    const parsed = parseMigrationFileName(entry.name)
    if (!parsed) {
      continue
    }

    const existing = byVersion.get(parsed.version)
    if (!existing) {
      byVersion.set(parsed.version, {
        name: parsed.name,
        upFileName: parsed.direction === "up" ? parsed.fileName : undefined,
        downFileName: parsed.direction === "down" ? parsed.fileName : undefined,
      })
      continue
    }

    if (existing.name !== parsed.name) {
      throw new Error(
        `[migrate] conflicting migration names for version ${parsed.version}: ` +
          `${existing.name} vs ${parsed.name}`,
      )
    }

    if (parsed.direction === "up") {
      if (existing.upFileName) {
        throw new Error(`[migrate] duplicate up migration for version ${parsed.version}`)
      }
      existing.upFileName = parsed.fileName
      continue
    }

    if (existing.downFileName) {
      throw new Error(`[migrate] duplicate down migration for version ${parsed.version}`)
    }
    existing.downFileName = parsed.fileName
  }

  const versions = [...byVersion.keys()].sort((a, b) => a - b)
  if (versions.length === 0) {
    throw new Error("[migrate] no migration files found in server/db/migrations")
  }

  if (versions[0] !== 1) {
    throw new Error("[migrate] first migration must start from version 1")
  }

  for (let index = 1; index < versions.length; index += 1) {
    const previous = versions[index - 1]
    const current = versions[index]
    if (current !== previous + 1) {
      throw new Error(`[migrate] migration versions must be continuous: missing ${previous + 1}`)
    }
  }

  const result: MigrationDefinition[] = []
  for (const version of versions) {
    const entry = byVersion.get(version)
    if (!entry || !entry.upFileName || !entry.downFileName) {
      throw new Error(`[migrate] missing up/down pair for migration version ${version}`)
    }

    if (version === 1 && entry.name !== "init") {
      throw new Error('[migrate] version 1 must be named "init" (1_init.up.sql / 1_init.down.sql)')
    }

    result.push({
      version,
      name: entry.name,
      upFileName: entry.upFileName,
      downFileName: entry.downFileName,
    })
  }

  return result
}

async function migrationTableExists(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ relation_name: string | null }>(
    "select to_regclass($1) as relation_name",
    [`public.${MIGRATIONS_TABLE}`],
  )
  return result.rows[0]?.relation_name !== null
}

async function migrationTableHasVersionColumn(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and column_name = 'version'
    `,
    [MIGRATIONS_TABLE],
  )

  return Number(result.rows[0]?.count ?? "0") > 0
}

async function readAppliedVersions(pool: Pool): Promise<Set<number>> {
  const result = await pool.query<{ version: number }>(
    `select version from ${MIGRATIONS_TABLE} order by version asc`,
  )
  return new Set(result.rows.map((row) => row.version))
}

export async function applyPendingMigrations(options?: { pool?: Pool; closePool?: boolean }): Promise<void> {
  if (!options?.pool) {
    await ensureDatabaseExistsFromEnv()
  }

  const pool = options?.pool ?? getPgPool()
  const closePool = options?.closePool ?? false
  const migrationsDir = await resolveMigrationsDir()
  const migrations = await readMigrationDefinitions(migrationsDir)

  try {
    let hasMigrationTable = await migrationTableExists(pool)
    if (hasMigrationTable) {
      const hasVersionColumn = await migrationTableHasVersionColumn(pool)
      if (!hasVersionColumn) {
        console.warn("[migrate] detected legacy schema_migrations format, recreating metadata table")
        await pool.query(`drop table if exists ${MIGRATIONS_TABLE}`)
        hasMigrationTable = false
      }
    }

    const appliedVersions = hasMigrationTable ? await readAppliedVersions(pool) : new Set<number>()

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        console.log(`[migrate] skip ${migration.upFileName}`)
        continue
      }

      const sqlFilePath = path.resolve(migrationsDir, migration.upFileName)
      const sql = await readFile(sqlFilePath, "utf8")
      const client = await pool.connect()

      try {
        console.log(`[migrate] apply ${migration.upFileName}`)
        await client.query("begin")
        await client.query(sql)
        await client.query(
          `insert into ${MIGRATIONS_TABLE} (version, name, up_file, down_file) values ($1, $2, $3, $4)`,
          [migration.version, migration.name, migration.upFileName, migration.downFileName],
        )
        await client.query("commit")
        appliedVersions.add(migration.version)
        console.log(`[migrate] applied ${migration.upFileName}`)
      } catch (error) {
        await client.query("rollback")
        throw error
      } finally {
        client.release()
      }
    }
  } finally {
    if (closePool) {
      await pool.end()
    }
  }
}

let startupMigrationsPromise: Promise<void> | null = null

export function ensureStartupMigrations(): Promise<void> {
  if (!startupMigrationsPromise) {
    startupMigrationsPromise = applyPendingMigrations().catch((error) => {
      startupMigrationsPromise = null
      throw error
    })
  }

  return startupMigrationsPromise
}

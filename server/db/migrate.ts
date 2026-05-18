import { applyPendingMigrations } from "./migration-runner.ts"

function loadEnvForCli(): void {
  const maybeLoadEnvFile = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile
  if (typeof maybeLoadEnvFile !== "function") {
    return
  }

  for (const envPath of [".env", ".env.local"]) {
    try {
      maybeLoadEnvFile(envPath)
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || (error as { code?: string }).code !== "ENOENT") {
        throw error
      }
    }
  }
}

async function main(): Promise<void> {
  loadEnvForCli()

  try {
    await applyPendingMigrations({ closePool: true })
  } catch (error) {
    console.error("[migrate] failed")
    console.error(error)
    process.exitCode = 1
  }
}

await main()

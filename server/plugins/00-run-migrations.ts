import { ensureStartupMigrations } from "../db/migration-runner"

export default defineNitroPlugin(async () => {
  try {
    await ensureStartupMigrations()
  } catch (error) {
    console.error("[migrate] startup migrations failed")
    console.error(error)

    if (process.env.NODE_ENV === "production") {
      throw error
    }
  }
})

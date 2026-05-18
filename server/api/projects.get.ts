import { defineEventHandler, getQuery } from "h3"

import { AppError, withAppErrorHandling } from "../core/errors/app-error"
import { getProviderService } from "../modules/provider/services/provider.service"

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== "string") {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `${fieldName} must be a string`,
    })
  }

  const normalized = value.trim()
  return normalized.length ? normalized : undefined
}

export default defineEventHandler(async (event) => {
  return await withAppErrorHandling(event, async () => {
    const query = getQuery(event)
    const search = parseOptionalString(query.search, "search")

    return await getProviderService().getProjects(search)
  })
})

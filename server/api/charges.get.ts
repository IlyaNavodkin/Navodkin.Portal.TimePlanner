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

function parseStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === "string") {
    const normalized = value.trim()
    return normalized.length ? [normalized] : undefined
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (typeof item !== "string") {
          throw new AppError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: `${fieldName} must contain only strings`,
          })
        }
        return item.trim()
      })
      .filter((item) => item.length > 0)

    return items.length ? items : undefined
  }

  throw new AppError({
    status: 400,
    code: "VALIDATION_ERROR",
    message: `${fieldName} must be a string or array of strings`,
  })
}

export default defineEventHandler(async (event) => {
  return await withAppErrorHandling(event, async () => {
    const query = getQuery(event)
    const rawProjectIds = query.projectIds ?? query["projectIds[]"]
    const projectIds = parseStringArray(rawProjectIds, "projectIds")
    const search = parseOptionalString(query.search, "search")

    return await getProviderService().getCharges({ projectIds, search })
  })
})

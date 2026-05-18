import { defineEventHandler, getQuery } from "h3"

import { AppError, withAppErrorHandling } from "../core/errors/app-error"
import { getTimelineHandler } from "../modules/timelines/use-cases/get-timeline.handler"

function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `${fieldName} is required and must be a string`,
    })
  }

  const normalized = value.trim()
  if (!normalized) {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `${fieldName} is required and must be a non-empty string`,
    })
  }

  return normalized
}

function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false
  }

  const parsed = new Date(`${date}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

function parseRequiredDate(value: unknown, fieldName: string): string {
  const date = parseRequiredString(value, fieldName)
  if (!isValidIsoDate(date)) {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `${fieldName} must be a date in YYYY-MM-DD format`,
    })
  }

  return date
}

function parseOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
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
    const managerId = parseRequiredString(query.managerId, "managerId")
    const from = parseRequiredDate(query.from, "from")
    const to = parseRequiredDate(query.to, "to")

    if (from > to) {
      throw new AppError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "from must be less than or equal to to",
      })
    }

    const rawProjectIds = query.projectIds ?? query["projectIds[]"]
    const rawChargeIds = query.chargeIds ?? query["chargeIds[]"]
    const projectIds = parseOptionalStringArray(rawProjectIds, "projectIds")
    const chargeIds = parseOptionalStringArray(rawChargeIds, "chargeIds")

    return await getTimelineHandler().execute({
      managerId,
      from,
      to,
      projectIds,
      chargeIds,
    })
  })
})


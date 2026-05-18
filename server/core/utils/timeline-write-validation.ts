import { AppError } from "../errors/app-error"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function invalidBody(): never {
  throw new AppError({
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Request body must be a JSON object",
  })
}

export function parseObjectBody(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    invalidBody()
  }

  return value
}

export function parseRequiredStringField(
  source: Record<string, unknown>,
  fieldName: string,
): string {
  const value = source[fieldName]
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

export function parseOptionalStringField(
  source: Record<string, unknown>,
  fieldName: string,
): string | undefined {
  const value = source[fieldName]
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
  if (!normalized) {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `${fieldName} must be a non-empty string`,
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

function parseDaysInternal(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `${fieldName} must be an array of YYYY-MM-DD strings`,
    })
  }

  if (value.length === 0) {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `${fieldName} must contain at least one date`,
    })
  }

  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== "string") {
      throw new AppError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: `${fieldName} must contain only strings`,
      })
    }

    const normalized = item.trim()
    if (!isValidIsoDate(normalized)) {
      throw new AppError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: `${fieldName} must contain dates in YYYY-MM-DD format`,
      })
    }

    unique.add(normalized)
  }

  return Array.from(unique).sort((left, right) => left.localeCompare(right))
}

export function parseRequiredDaysField(source: Record<string, unknown>, fieldName = "days"): string[] {
  return parseDaysInternal(source[fieldName], fieldName)
}

export function parseOptionalDaysField(
  source: Record<string, unknown>,
  fieldName = "days",
): string[] | undefined {
  const value = source[fieldName]
  if (value === undefined) {
    return undefined
  }

  return parseDaysInternal(value, fieldName)
}

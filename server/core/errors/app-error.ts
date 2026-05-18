import type { H3Event } from "h3"
import { setResponseStatus } from "h3"

export interface AppErrorShape {
  status: number
  code: string
  message: string
  details?: unknown
}

export class AppError extends Error implements AppErrorShape {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(input: AppErrorShape) {
    super(input.message)
    this.name = "AppError"
    this.status = normalizeStatus(input.status)
    this.code = input.code
    this.details = input.details
  }
}

interface ErrorResponseBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

const DEFAULT_ERROR: AppErrorShape = {
  status: 500,
  code: "INTERNAL_ERROR",
  message: "Internal server error",
}

const STATUS_TO_CODE: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
}

function normalizeStatus(status: number): number {
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function maybeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function maybeStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? normalizeStatus(value) : undefined
}

function deriveStatus(error: Record<string, unknown>): number | undefined {
  const status = maybeStatus(error.status)
  if (status) {
    return status
  }

  return maybeStatus(error.statusCode)
}

function deriveCode(error: Record<string, unknown>, status: number): string {
  const code = maybeString(error.code)
  if (code) {
    return code
  }

  return STATUS_TO_CODE[status] ?? DEFAULT_ERROR.code
}

function deriveMessage(error: Record<string, unknown>, status: number): string {
  const message = maybeString(error.message) ?? maybeString(error.statusMessage)
  if (message) {
    return message
  }

  if (status === 500) {
    return DEFAULT_ERROR.message
  }

  return `HTTP ${status}`
}

function deriveDetails(error: Record<string, unknown>): unknown {
  if ("details" in error) {
    return error.details
  }

  if ("data" in error) {
    return error.data
  }

  return undefined
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    if (isRecord(error)) {
      const status = deriveStatus(error) ?? DEFAULT_ERROR.status
      return new AppError({
        status,
        code: deriveCode(error, status),
        message: error.message || deriveMessage(error, status),
        details: deriveDetails(error),
      })
    }

    return new AppError({
      ...DEFAULT_ERROR,
      message: error.message || DEFAULT_ERROR.message,
    })
  }

  if (isRecord(error)) {
    const status = deriveStatus(error) ?? DEFAULT_ERROR.status
    return new AppError({
      status,
      code: deriveCode(error, status),
      message: deriveMessage(error, status),
      details: deriveDetails(error),
    })
  }

  return new AppError(DEFAULT_ERROR)
}

export function sendAppError(event: H3Event, error: unknown): ErrorResponseBody {
  const appError = toAppError(error)
  setResponseStatus(event, appError.status)
  return {
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
  }
}

export async function withAppErrorHandling<T>(
  event: H3Event,
  handler: () => Promise<T>,
): Promise<T | ErrorResponseBody> {
  try {
    return await handler()
  } catch (error) {
    return sendAppError(event, error)
  }
}

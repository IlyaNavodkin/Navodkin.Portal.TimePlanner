import { ERROR_CODES } from "./error-codes.js";
import { randomUUID } from "crypto";

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    traceId: string;
  };
}

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  exposeDetails: boolean;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    exposeDetails?: boolean;
  }) {
    super(params.message);
    this.name = "AppError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.exposeDetails = params.exposeDetails ?? params.status < 500;
  }
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}

export function ensureTraceId(candidate: unknown): string {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  return randomUUID();
}

export function normalizeAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError({
    status: 500,
    code: ERROR_CODES.INTERNAL_ERROR,
    message: "Internal server error",
    details: getErrorMessage(err),
    exposeDetails: false,
  });
}

export function toErrorEnvelope(err: AppError, traceId: string): ErrorEnvelope {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.exposeDetails && err.details !== undefined ? { details: err.details } : {}),
      traceId,
    },
  };
}

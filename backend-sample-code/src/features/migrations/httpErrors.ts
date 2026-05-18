import { ERROR_CODES } from "../../shared/error-codes.js";
import { AppError, getErrorMessage } from "../../shared/errors.js";

export function mapMigrationHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = getErrorMessage(err);

  if (message.includes("Invalid migrate secret")) {
    return new AppError({ status: 403, code: ERROR_CODES.MIGRATION_SECRET_INVALID, message });
  }
  if (message.includes("target is required")) {
    return new AppError({ status: 400, code: ERROR_CODES.MIGRATION_TARGET_REQUIRED, message });
  }
  if (message.includes("not found")) {
    return new AppError({ status: 404, code: ERROR_CODES.MIGRATION_TARGET_NOT_FOUND, message });
  }

  return new AppError({
    status: 500,
    code: ERROR_CODES.MIGRATION_INTERNAL_ERROR,
    message: "Migration operation failed",
    details: message,
    exposeDetails: false,
  });
}

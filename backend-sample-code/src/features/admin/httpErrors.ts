import { ERROR_CODES } from "../../shared/error-codes.js";
import { AppError, getErrorMessage } from "../../shared/errors.js";

export function mapAdminHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = getErrorMessage(err);

  if (message.includes("roleId is required")) {
    return new AppError({ status: 400, code: ERROR_CODES.ADMIN_ROLE_ID_REQUIRED, message });
  }
  if (message.includes("roleId must be a positive integer")) {
    return new AppError({ status: 400, code: ERROR_CODES.ADMIN_ROLE_ID_INVALID, message });
  }
  if (message.includes("Cannot change your own role")) {
    return new AppError({ status: 400, code: ERROR_CODES.ADMIN_SELF_ROLE_CHANGE_FORBIDDEN, message });
  }
  if (message.includes("Cannot delete yourself")) {
    return new AppError({ status: 400, code: ERROR_CODES.ADMIN_SELF_DELETE_FORBIDDEN, message });
  }
  if (message.includes("Cannot ban yourself")) {
    return new AppError({ status: 400, code: ERROR_CODES.ADMIN_SELF_BAN_FORBIDDEN, message });
  }
  if (message.toLowerCase().includes("not found")) {
    return new AppError({ status: 404, code: ERROR_CODES.ADMIN_RESOURCE_NOT_FOUND, message });
  }
  if (
    message.includes("is required") ||
    message.includes("Unsupported file format") ||
    message.includes("File is too large") ||
    message.includes("File is empty") ||
    message.includes("Invalid asset kind")
  ) {
    return new AppError({ status: 400, code: ERROR_CODES.ADMIN_VALIDATION_ERROR, message });
  }

  return new AppError({
    status: 500,
    code: ERROR_CODES.ADMIN_INTERNAL_ERROR,
    message: "Failed to process admin request",
    details: message,
    exposeDetails: false,
  });
}

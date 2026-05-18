import { ERROR_CODES } from "../../shared/error-codes.js";
import { AppError, getErrorMessage } from "../../shared/errors.js";

export function mapAvatarHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = getErrorMessage(err);

  if (message.includes("Only PNG and JPG files are allowed")) {
    return new AppError({ status: 400, code: ERROR_CODES.AVATAR_FILE_TYPE_INVALID, message });
  }
  if (message.includes("Avatar upload is not available for SSO users")) {
    return new AppError({ status: 403, code: ERROR_CODES.AVATAR_UPLOAD_FORBIDDEN_SSO, message });
  }
  if (message.includes("No files provided")) {
    return new AppError({ status: 400, code: ERROR_CODES.AVATAR_FILES_REQUIRED, message });
  }
  if (message.includes("type must be speaking or silent")) {
    return new AppError({ status: 400, code: ERROR_CODES.AVATAR_TYPE_INVALID, message });
  }
  if (message.includes("avatar not found")) {
    return new AppError({ status: 404, code: ERROR_CODES.AVATAR_NOT_FOUND, message });
  }
  if (message.includes("corrupted avatar data")) {
    return new AppError({ status: 500, code: ERROR_CODES.AVATAR_DATA_CORRUPTED, message });
  }

  return new AppError({
    status: 500,
    code: ERROR_CODES.AVATAR_INTERNAL_ERROR,
    message: "Failed to process avatar request",
    details: message,
    exposeDetails: false,
  });
}

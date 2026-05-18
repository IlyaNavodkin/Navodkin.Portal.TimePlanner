import { ERROR_CODES } from "../../shared/error-codes.js";
import { AppError, getErrorMessage } from "../../shared/errors.js";

const REFRESH_AUTH_ERRORS = [
  "Invalid refresh token",
  "Session not found",
  "Session user mismatch",
  "Session revoked",
  "Session expired",
  "Refresh token mismatch",
];

export function mapAuthHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = getErrorMessage(err);

  if (message.includes("username and password are required")) {
    return new AppError({ status: 400, code: ERROR_CODES.AUTH_VALIDATION_ERROR, message });
  }
  if (message.includes("Invalid credentials")) {
    return new AppError({ status: 401, code: ERROR_CODES.AUTH_INVALID_CREDENTIALS, message });
  }
  if (message.includes("Username already taken")) {
    return new AppError({ status: 409, code: ERROR_CODES.AUTH_USERNAME_TAKEN, message });
  }
  if (message.includes("refreshToken is required")) {
    return new AppError({ status: 400, code: ERROR_CODES.AUTH_REFRESH_REQUIRED, message });
  }
  if (REFRESH_AUTH_ERRORS.some((part) => message.includes(part))) {
    return new AppError({ status: 401, code: ERROR_CODES.AUTH_REFRESH_INVALID, message });
  }
  if (message.includes("session id is missing")) {
    return new AppError({ status: 400, code: ERROR_CODES.AUTH_SESSION_ID_MISSING, message });
  }
  if (message.includes("logout_token is required")) {
    return new AppError({ status: 400, code: ERROR_CODES.AUTH_OIDC_LOGOUT_TOKEN_REQUIRED, message });
  }
  if (
    message.includes("Malformed logout token") ||
    message.includes("Issuer mismatch") ||
    message.includes("Audience mismatch") ||
    message.includes("Invalid logout events claim")
  ) {
    return new AppError({ status: 400, code: ERROR_CODES.AUTH_OIDC_LOGOUT_INVALID, message });
  }
  if (message.includes("OIDC not enabled")) {
    return new AppError({ status: 404, code: ERROR_CODES.AUTH_OIDC_DISABLED, message });
  }

  return new AppError({
    status: 500,
    code: ERROR_CODES.AUTH_INTERNAL_ERROR,
    message: "Failed to process auth request",
    details: message,
    exposeDetails: false,
  });
}

import { ERROR_CODES } from "../../shared/error-codes.js";
import { AppError, getErrorMessage } from "../../shared/errors.js";

function isModerationConflict(message: string): boolean {
  return message.includes("Cannot kick yourself") ||
    message.includes("Cannot ban yourself") ||
    message.includes("Cannot moderate");
}

export function mapRoomHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = getErrorMessage(err);

  if (message.includes("Only members")) {
    return new AppError({ status: 403, code: ERROR_CODES.ROOM_CREATE_FORBIDDEN, message });
  }
  if (message.includes("Room limit reached")) {
    return new AppError({ status: 403, code: ERROR_CODES.ROOM_LIMIT_REACHED, message });
  }
  if (message.includes("already taken")) {
    return new AppError({ status: 409, code: ERROR_CODES.ROOM_NAME_CONFLICT, message });
  }
  if (message.includes("Password required")) {
    return new AppError({ status: 401, code: ERROR_CODES.ROOM_PASSWORD_REQUIRED, message });
  }
  if (message.includes("Invalid room password")) {
    return new AppError({ status: 401, code: ERROR_CODES.ROOM_PASSWORD_INVALID, message });
  }
  if (message.includes("You are banned from this room")) {
    return new AppError({ status: 403, code: ERROR_CODES.ROOM_BANNED, message });
  }
  if (message.includes("Not authorized")) {
    return new AppError({ status: 403, code: ERROR_CODES.ROOM_FORBIDDEN, message });
  }
  if (isModerationConflict(message)) {
    return new AppError({ status: 400, code: ERROR_CODES.ROOM_MODERATION_CONFLICT, message });
  }
  if (message.toLowerCase().includes("not found")) {
    return new AppError({ status: 404, code: ERROR_CODES.ROOM_RESOURCE_NOT_FOUND, message });
  }

  return new AppError({
    status: 500,
    code: ERROR_CODES.ROOM_INTERNAL_ERROR,
    message: "Failed to process room request",
    details: message,
    exposeDetails: false,
  });
}

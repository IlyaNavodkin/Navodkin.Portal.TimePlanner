import { ERROR_CODES } from "../../shared/error-codes.js";
import { AppError, getErrorMessage } from "../../shared/errors.js";

export function mapLivekitHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = getErrorMessage(err);

  if (message.includes("Room not found")) {
    return new AppError({ status: 404, code: ERROR_CODES.LIVEKIT_ROOM_NOT_FOUND, message });
  }
  if (message.includes("You are banned from this room")) {
    return new AppError({ status: 403, code: ERROR_CODES.LIVEKIT_ROOM_BANNED, message });
  }
  if (message.includes("Join room first")) {
    return new AppError({ status: 403, code: ERROR_CODES.LIVEKIT_ROOM_JOIN_REQUIRED, message });
  }
  if (message.includes("Already connected to this room")) {
    return new AppError({ status: 409, code: ERROR_CODES.LIVEKIT_ROOM_ALREADY_CONNECTED, message });
  }

  return new AppError({
    status: 500,
    code: ERROR_CODES.LIVEKIT_JOIN_FAILED,
    message: "Failed to process LiveKit join request",
    details: message,
    exposeDetails: false,
  });
}

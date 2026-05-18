import { ERROR_CODES } from "../../shared/error-codes.js";
import { AppError, getErrorMessage } from "../../shared/errors.js";

export function mapRadioHttpError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = getErrorMessage(err);

  if (message.includes("not found")) {
    return new AppError({ status: 404, code: ERROR_CODES.RADIO_TRACK_NOT_FOUND, message });
  }
  if (message.includes("Only MP3 files are allowed")) {
    return new AppError({ status: 400, code: ERROR_CODES.RADIO_FILE_TYPE_INVALID, message });
  }

  return new AppError({
    status: 500,
    code: ERROR_CODES.RADIO_INTERNAL_ERROR,
    message: "Failed to process radio request",
    details: message,
    exposeDetails: false,
  });
}

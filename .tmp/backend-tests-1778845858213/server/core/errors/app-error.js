"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.toAppError = toAppError;
exports.sendAppError = sendAppError;
exports.withAppErrorHandling = withAppErrorHandling;
const h3_1 = require("h3");
class AppError extends Error {
    status;
    code;
    details;
    constructor(input) {
        super(input.message);
        this.name = "AppError";
        this.status = normalizeStatus(input.status);
        this.code = input.code;
        this.details = input.details;
    }
}
exports.AppError = AppError;
const DEFAULT_ERROR = {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
};
const STATUS_TO_CODE = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
};
function normalizeStatus(status) {
    return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function maybeString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
function maybeStatus(value) {
    return typeof value === "number" && Number.isFinite(value) ? normalizeStatus(value) : undefined;
}
function deriveStatus(error) {
    const status = maybeStatus(error.status);
    if (status) {
        return status;
    }
    return maybeStatus(error.statusCode);
}
function deriveCode(error, status) {
    const code = maybeString(error.code);
    if (code) {
        return code;
    }
    return STATUS_TO_CODE[status] ?? DEFAULT_ERROR.code;
}
function deriveMessage(error, status) {
    const message = maybeString(error.message) ?? maybeString(error.statusMessage);
    if (message) {
        return message;
    }
    if (status === 500) {
        return DEFAULT_ERROR.message;
    }
    return `HTTP ${status}`;
}
function deriveDetails(error) {
    if ("details" in error) {
        return error.details;
    }
    if ("data" in error) {
        return error.data;
    }
    return undefined;
}
function toAppError(error) {
    if (error instanceof AppError) {
        return error;
    }
    if (error instanceof Error) {
        if (isRecord(error)) {
            const status = deriveStatus(error) ?? DEFAULT_ERROR.status;
            return new AppError({
                status,
                code: deriveCode(error, status),
                message: error.message || deriveMessage(error, status),
                details: deriveDetails(error),
            });
        }
        return new AppError({
            ...DEFAULT_ERROR,
            message: error.message || DEFAULT_ERROR.message,
        });
    }
    if (isRecord(error)) {
        const status = deriveStatus(error) ?? DEFAULT_ERROR.status;
        return new AppError({
            status,
            code: deriveCode(error, status),
            message: deriveMessage(error, status),
            details: deriveDetails(error),
        });
    }
    return new AppError(DEFAULT_ERROR);
}
function sendAppError(event, error) {
    const appError = toAppError(error);
    (0, h3_1.setResponseStatus)(event, appError.status);
    return {
        error: {
            code: appError.code,
            message: appError.message,
            details: appError.details,
        },
    };
}
async function withAppErrorHandling(event, handler) {
    try {
        return await handler();
    }
    catch (error) {
        return sendAppError(event, error);
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseObjectBody = parseObjectBody;
exports.parseRequiredStringField = parseRequiredStringField;
exports.parseOptionalStringField = parseOptionalStringField;
exports.parseRequiredDaysField = parseRequiredDaysField;
exports.parseOptionalDaysField = parseOptionalDaysField;
const app_error_1 = require("../errors/app-error");
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invalidBody() {
    throw new app_error_1.AppError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Request body must be a JSON object",
    });
}
function parseObjectBody(value) {
    if (!isRecord(value)) {
        invalidBody();
    }
    return value;
}
function parseRequiredStringField(source, fieldName) {
    const value = source[fieldName];
    if (typeof value !== "string") {
        throw new app_error_1.AppError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: `${fieldName} is required and must be a string`,
        });
    }
    const normalized = value.trim();
    if (!normalized) {
        throw new app_error_1.AppError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: `${fieldName} is required and must be a non-empty string`,
        });
    }
    return normalized;
}
function parseOptionalStringField(source, fieldName) {
    const value = source[fieldName];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new app_error_1.AppError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: `${fieldName} must be a string`,
        });
    }
    const normalized = value.trim();
    if (!normalized) {
        throw new app_error_1.AppError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: `${fieldName} must be a non-empty string`,
        });
    }
    return normalized;
}
function isValidIsoDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function parseDaysInternal(value, fieldName) {
    if (!Array.isArray(value)) {
        throw new app_error_1.AppError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: `${fieldName} must be an array of YYYY-MM-DD strings`,
        });
    }
    if (value.length === 0) {
        throw new app_error_1.AppError({
            status: 400,
            code: "VALIDATION_ERROR",
            message: `${fieldName} must contain at least one date`,
        });
    }
    const unique = new Set();
    for (const item of value) {
        if (typeof item !== "string") {
            throw new app_error_1.AppError({
                status: 400,
                code: "VALIDATION_ERROR",
                message: `${fieldName} must contain only strings`,
            });
        }
        const normalized = item.trim();
        if (!isValidIsoDate(normalized)) {
            throw new app_error_1.AppError({
                status: 400,
                code: "VALIDATION_ERROR",
                message: `${fieldName} must contain dates in YYYY-MM-DD format`,
            });
        }
        unique.add(normalized);
    }
    return Array.from(unique).sort((left, right) => left.localeCompare(right));
}
function parseRequiredDaysField(source, fieldName = "days") {
    return parseDaysInternal(source[fieldName], fieldName);
}
function parseOptionalDaysField(source, fieldName = "days") {
    const value = source[fieldName];
    if (value === undefined) {
        return undefined;
    }
    return parseDaysInternal(value, fieldName);
}

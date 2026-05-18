"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const app_error_1 = require("../../server/core/errors/app-error");
const timeline_write_validation_1 = require("../../server/core/utils/timeline-write-validation");
(0, node_test_1.describe)("timeline-write-validation days/date", () => {
    (0, node_test_1.it)("normalizes, deduplicates and sorts required days", () => {
        const source = {
            days: ["2026-05-14", " 2026-05-12 ", "2026-05-14", "2026-05-13"],
        };
        const result = (0, timeline_write_validation_1.parseRequiredDaysField)(source);
        strict_1.default.deepEqual(result, ["2026-05-12", "2026-05-13", "2026-05-14"]);
    });
    (0, node_test_1.it)("returns undefined for absent optional days", () => {
        const result = (0, timeline_write_validation_1.parseOptionalDaysField)({});
        strict_1.default.equal(result, undefined);
    });
    (0, node_test_1.it)("throws VALIDATION_ERROR for empty days array", () => {
        strict_1.default.throws(() => (0, timeline_write_validation_1.parseRequiredDaysField)({ days: [] }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 400);
            strict_1.default.equal(error.code, "VALIDATION_ERROR");
            strict_1.default.match(error.message, /at least one date/);
            return true;
        });
    });
    (0, node_test_1.it)("throws VALIDATION_ERROR for non-string day entry", () => {
        strict_1.default.throws(() => (0, timeline_write_validation_1.parseRequiredDaysField)({ days: ["2026-05-12", 42] }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 400);
            strict_1.default.equal(error.code, "VALIDATION_ERROR");
            strict_1.default.match(error.message, /only strings/);
            return true;
        });
    });
    (0, node_test_1.it)("throws VALIDATION_ERROR for invalid date format", () => {
        strict_1.default.throws(() => (0, timeline_write_validation_1.parseRequiredDaysField)({ days: ["2026/05/12"] }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 400);
            strict_1.default.equal(error.code, "VALIDATION_ERROR");
            strict_1.default.match(error.message, /YYYY-MM-DD/);
            return true;
        });
    });
    (0, node_test_1.it)("throws VALIDATION_ERROR for impossible ISO date", () => {
        strict_1.default.throws(() => (0, timeline_write_validation_1.parseRequiredDaysField)({ days: ["2026-02-30"] }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 400);
            strict_1.default.equal(error.code, "VALIDATION_ERROR");
            strict_1.default.match(error.message, /YYYY-MM-DD/);
            return true;
        });
    });
});

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const app_error_1 = require("../../server/core/errors/app-error");
const delete_timeline_handler_1 = require("../../server/modules/timelines/use-cases/delete-timeline.handler");
(0, node_test_1.describe)("DeleteTimelineHandler", () => {
    (0, node_test_1.it)("deletes existing timeline", async () => {
        const readRepo = {
            async findTimelineById(id) {
                return {
                    id,
                    projectExternalId: "pr-1",
                    chargeExternalId: "ch-1",
                    managerExternalId: "mgr-1",
                    employeeExternalId: "emp-1",
                };
            },
            async createTimeline() {
                return { id: "unused" };
            },
            async updateTimeline() { },
            async replaceTimelineDays() { },
            async deleteTimeline() { },
        };
        let deletedId;
        const writeRepo = {
            async findTimelineById() {
                return null;
            },
            async createTimeline() {
                return { id: "unused" };
            },
            async updateTimeline() { },
            async replaceTimelineDays() { },
            async deleteTimeline(id) {
                deletedId = id;
            },
        };
        let uowExecuted = 0;
        const unitOfWork = {
            async execute(work) {
                uowExecuted += 1;
                return await work({});
            },
        };
        const handler = new delete_timeline_handler_1.DeleteTimelineHandler(readRepo, unitOfWork, () => writeRepo);
        const result = await handler.execute("timeline-1");
        strict_1.default.deepEqual(result, { id: "timeline-1" });
        strict_1.default.equal(uowExecuted, 1);
        strict_1.default.equal(deletedId, "timeline-1");
    });
    (0, node_test_1.it)("throws TIMELINE_NOT_FOUND when record is missing", async () => {
        const readRepo = {
            async findTimelineById() {
                return null;
            },
            async createTimeline() {
                return { id: "unused" };
            },
            async updateTimeline() { },
            async replaceTimelineDays() { },
            async deleteTimeline() { },
        };
        const unitOfWork = {
            async execute(work) {
                return await work({});
            },
        };
        const handler = new delete_timeline_handler_1.DeleteTimelineHandler(readRepo, unitOfWork, () => {
            throw new Error("repo factory must not be called");
        });
        await strict_1.default.rejects(handler.execute("missing"), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 404);
            strict_1.default.equal(error.code, "TIMELINE_NOT_FOUND");
            return true;
        });
    });
});

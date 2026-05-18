"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const app_error_1 = require("../../server/core/errors/app-error");
const create_timeline_handler_1 = require("../../server/modules/timelines/use-cases/create-timeline.handler");
(0, node_test_1.describe)("CreateTimelineHandler", () => {
    (0, node_test_1.it)("creates timeline and days when employee/charge relations are valid", async () => {
        const providerCalls = {};
        const provider = {
            async getEmployeesByManager(managerId) {
                providerCalls.managerId = managerId;
                return [{ id: "emp-1", name: "Employee 1", managerId }];
            },
            async getCharges(options) {
                providerCalls.chargeProjectIds = options?.projectIds;
                return [{ id: "ch-1", name: "Charge 1", projectId: "pr-1" }];
            },
        };
        const repoCalls = {};
        const repository = {
            async findTimelineById() {
                return null;
            },
            async createTimeline(input) {
                repoCalls.createInput = input;
                return { id: "timeline-1" };
            },
            async updateTimeline() { },
            async replaceTimelineDays(timelineId, days) {
                repoCalls.replaceInput = { timelineId, days };
            },
            async deleteTimeline() { },
        };
        let uowExecuted = 0;
        const unitOfWork = {
            async execute(work) {
                uowExecuted += 1;
                return await work({});
            },
        };
        const handler = new create_timeline_handler_1.CreateTimelineHandler(provider, unitOfWork, () => repository);
        const result = await handler.execute({
            projectExternalId: "pr-1",
            chargeExternalId: "ch-1",
            managerExternalId: "mgr-1",
            employeeExternalId: "emp-1",
            days: ["2026-05-11", "2026-05-12"],
            comment: "new",
        });
        strict_1.default.deepEqual(result, { id: "timeline-1" });
        strict_1.default.equal(uowExecuted, 1);
        strict_1.default.equal(providerCalls.managerId, "mgr-1");
        strict_1.default.deepEqual(providerCalls.chargeProjectIds, ["pr-1"]);
        strict_1.default.deepEqual(repoCalls.createInput, {
            projectExternalId: "pr-1",
            chargeExternalId: "ch-1",
            managerExternalId: "mgr-1",
            employeeExternalId: "emp-1",
            employeeName: "Employee 1",
            comment: "new",
        });
        strict_1.default.deepEqual(repoCalls.replaceInput, {
            timelineId: "timeline-1",
            days: ["2026-05-11", "2026-05-12"],
        });
    });
    (0, node_test_1.it)("throws EMPLOYEE_MANAGER_MISMATCH when employee does not belong to manager", async () => {
        const provider = {
            async getEmployeesByManager() {
                return [{ id: "emp-x", name: "Other", managerId: "mgr-1" }];
            },
            async getCharges() {
                throw new Error("must not call getCharges");
            },
        };
        let uowExecuted = 0;
        const unitOfWork = {
            async execute(work) {
                uowExecuted += 1;
                return await work({});
            },
        };
        const handler = new create_timeline_handler_1.CreateTimelineHandler(provider, unitOfWork, () => {
            throw new Error("repo factory must not be called");
        });
        await strict_1.default.rejects(handler.execute({
            projectExternalId: "pr-1",
            chargeExternalId: "ch-1",
            managerExternalId: "mgr-1",
            employeeExternalId: "emp-1",
            days: ["2026-05-11"],
        }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 400);
            strict_1.default.equal(error.code, "EMPLOYEE_MANAGER_MISMATCH");
            return true;
        });
        strict_1.default.equal(uowExecuted, 0);
    });
    (0, node_test_1.it)("throws CHARGE_PROJECT_MISMATCH when charge does not belong to project", async () => {
        const provider = {
            async getEmployeesByManager(managerId) {
                return [{ id: "emp-1", name: "Employee 1", managerId }];
            },
            async getCharges() {
                return [{ id: "ch-x", name: "Other", projectId: "pr-1" }];
            },
        };
        let uowExecuted = 0;
        const unitOfWork = {
            async execute(work) {
                uowExecuted += 1;
                return await work({});
            },
        };
        const handler = new create_timeline_handler_1.CreateTimelineHandler(provider, unitOfWork, () => {
            throw new Error("repo factory must not be called");
        });
        await strict_1.default.rejects(handler.execute({
            projectExternalId: "pr-1",
            chargeExternalId: "ch-1",
            managerExternalId: "mgr-1",
            employeeExternalId: "emp-1",
            days: ["2026-05-11"],
        }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 400);
            strict_1.default.equal(error.code, "CHARGE_PROJECT_MISMATCH");
            return true;
        });
        strict_1.default.equal(uowExecuted, 0);
    });
});

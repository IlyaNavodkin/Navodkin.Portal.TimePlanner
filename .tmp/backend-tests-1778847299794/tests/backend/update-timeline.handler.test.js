"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const app_error_1 = require("../../server/core/errors/app-error");
const update_timeline_handler_1 = require("../../server/modules/timelines/use-cases/update-timeline.handler");
function createCurrentRepo(current) {
    const timeline = current === null
        ? null
        : {
            id: current,
            projectExternalId: "pr-1",
            chargeExternalId: "ch-1",
            managerExternalId: "mgr-1",
            employeeExternalId: "emp-1",
            employeeName: "Old Name",
            comment: "old",
        };
    const repo = {
        async findTimelineById() {
            return timeline;
        },
        async createTimeline() {
            return { id: "unused" };
        },
        async updateTimeline() { },
        async replaceTimelineDays() { },
        async deleteTimeline() { },
    };
    return repo;
}
(0, node_test_1.describe)("UpdateTimelineHandler", () => {
    (0, node_test_1.it)("updates metadata and days with validated employee name", async () => {
        const providerCalls = {};
        const provider = {
            async getEmployeesByManager(managerId) {
                providerCalls.managerId = managerId;
                return [{ id: "emp-3", name: "Employee 3", managerId }];
            },
            async getCharges(options) {
                providerCalls.projectIds = options?.projectIds;
                return [{ id: "ch-3", name: "Charge 3", projectId: "pr-2" }];
            },
        };
        const readRepo = createCurrentRepo("timeline-1");
        const writeCalls = {};
        const writeRepo = {
            async findTimelineById() {
                return null;
            },
            async createTimeline() {
                return { id: "unused" };
            },
            async updateTimeline(id, input) {
                writeCalls.update = { id, input };
            },
            async replaceTimelineDays(id, days) {
                writeCalls.replaceDays = { id, days };
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
        const handler = new update_timeline_handler_1.UpdateTimelineHandler(provider, readRepo, unitOfWork, () => writeRepo);
        const result = await handler.execute({
            id: "timeline-1",
            projectExternalId: "pr-2",
            chargeExternalId: "ch-3",
            managerExternalId: "mgr-2",
            employeeExternalId: "emp-3",
            days: ["2026-05-13", "2026-05-14"],
            comment: "updated",
        });
        strict_1.default.deepEqual(result, { id: "timeline-1" });
        strict_1.default.equal(uowExecuted, 1);
        strict_1.default.equal(providerCalls.managerId, "mgr-2");
        strict_1.default.deepEqual(providerCalls.projectIds, ["pr-2"]);
        strict_1.default.deepEqual(writeCalls.update, {
            id: "timeline-1",
            input: {
                projectExternalId: "pr-2",
                chargeExternalId: "ch-3",
                managerExternalId: "mgr-2",
                employeeExternalId: "emp-3",
                employeeName: "Employee 3",
                comment: "updated",
            },
        });
        strict_1.default.deepEqual(writeCalls.replaceDays, {
            id: "timeline-1",
            days: ["2026-05-13", "2026-05-14"],
        });
    });
    (0, node_test_1.it)("updates only days without metadata write when meta fields are absent", async () => {
        const provider = {
            async getEmployeesByManager() {
                throw new Error("provider must not be called");
            },
            async getCharges() {
                throw new Error("provider must not be called");
            },
        };
        const readRepo = createCurrentRepo("timeline-1");
        let updateCalled = false;
        let replaceCalled = false;
        const writeRepo = {
            async findTimelineById() {
                return null;
            },
            async createTimeline() {
                return { id: "unused" };
            },
            async updateTimeline() {
                updateCalled = true;
            },
            async replaceTimelineDays() {
                replaceCalled = true;
            },
            async deleteTimeline() { },
        };
        const unitOfWork = {
            async execute(work) {
                return await work({});
            },
        };
        const handler = new update_timeline_handler_1.UpdateTimelineHandler(provider, readRepo, unitOfWork, () => writeRepo);
        await handler.execute({
            id: "timeline-1",
            days: ["2026-05-20"],
        });
        strict_1.default.equal(updateCalled, false);
        strict_1.default.equal(replaceCalled, true);
    });
    (0, node_test_1.it)("throws EMPLOYEE_MANAGER_MISMATCH on invalid manager-employee relation", async () => {
        const provider = {
            async getEmployeesByManager() {
                return [{ id: "emp-x", name: "Other", managerId: "mgr-2" }];
            },
            async getCharges() {
                return [];
            },
        };
        const readRepo = createCurrentRepo("timeline-1");
        const unitOfWork = {
            async execute(work) {
                return await work({});
            },
        };
        const handler = new update_timeline_handler_1.UpdateTimelineHandler(provider, readRepo, unitOfWork, () => {
            throw new Error("repo factory must not be called");
        });
        await strict_1.default.rejects(handler.execute({
            id: "timeline-1",
            managerExternalId: "mgr-2",
            employeeExternalId: "emp-3",
        }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 400);
            strict_1.default.equal(error.code, "EMPLOYEE_MANAGER_MISMATCH");
            return true;
        });
    });
    (0, node_test_1.it)("throws CHARGE_PROJECT_MISMATCH on invalid project-charge relation", async () => {
        const provider = {
            async getEmployeesByManager() {
                return [];
            },
            async getCharges() {
                return [{ id: "ch-x", name: "Other", projectId: "pr-2" }];
            },
        };
        const readRepo = createCurrentRepo("timeline-1");
        const unitOfWork = {
            async execute(work) {
                return await work({});
            },
        };
        const handler = new update_timeline_handler_1.UpdateTimelineHandler(provider, readRepo, unitOfWork, () => {
            throw new Error("repo factory must not be called");
        });
        await strict_1.default.rejects(handler.execute({
            id: "timeline-1",
            projectExternalId: "pr-2",
            chargeExternalId: "ch-3",
        }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 400);
            strict_1.default.equal(error.code, "CHARGE_PROJECT_MISMATCH");
            return true;
        });
    });
    (0, node_test_1.it)("throws TIMELINE_NOT_FOUND when timeline does not exist", async () => {
        const provider = {
            async getEmployeesByManager() {
                return [];
            },
            async getCharges() {
                return [];
            },
        };
        const readRepo = createCurrentRepo(null);
        const unitOfWork = {
            async execute(work) {
                return await work({});
            },
        };
        const handler = new update_timeline_handler_1.UpdateTimelineHandler(provider, readRepo, unitOfWork, () => {
            throw new Error("repo factory must not be called");
        });
        await strict_1.default.rejects(handler.execute({ id: "missing" }), (error) => {
            strict_1.default.ok(error instanceof app_error_1.AppError);
            strict_1.default.equal(error.status, 404);
            strict_1.default.equal(error.code, "TIMELINE_NOT_FOUND");
            return true;
        });
    });
});

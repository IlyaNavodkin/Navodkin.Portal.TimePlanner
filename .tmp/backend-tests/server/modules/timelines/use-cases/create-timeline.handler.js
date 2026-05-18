"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateTimelineHandler = void 0;
exports.getCreateTimelineHandler = getCreateTimelineHandler;
const unit_of_work_1 = require("../../../core/db/unit-of-work");
const app_error_1 = require("../../../core/errors/app-error");
const provider_service_1 = require("../../provider/services/provider.service");
const timeline_mutate_pg_1 = require("../data-access/timeline-mutate.pg");
class CreateTimelineHandler {
    providerService;
    unitOfWork;
    timelineMutateRepositoryFactory;
    constructor(providerService, unitOfWork, timelineMutateRepositoryFactory = (db) => new timeline_mutate_pg_1.PgTimelineMutateRepository(db)) {
        this.providerService = providerService;
        this.unitOfWork = unitOfWork;
        this.timelineMutateRepositoryFactory = timelineMutateRepositoryFactory;
    }
    async execute(input) {
        const employees = await this.providerService.getEmployeesByManager(input.managerExternalId);
        const employee = employees.find((candidate) => candidate.id === input.employeeExternalId);
        if (!employee) {
            throw new app_error_1.AppError({
                status: 400,
                code: "EMPLOYEE_MANAGER_MISMATCH",
                message: "employeeExternalId does not belong to managerExternalId",
            });
        }
        const charges = await this.providerService.getCharges({ projectIds: [input.projectExternalId] });
        const charge = charges.find((candidate) => candidate.id === input.chargeExternalId);
        if (!charge) {
            throw new app_error_1.AppError({
                status: 400,
                code: "CHARGE_PROJECT_MISMATCH",
                message: "chargeExternalId does not belong to projectExternalId",
            });
        }
        return await this.unitOfWork.execute(async (client) => {
            const timelineMutateRepository = this.timelineMutateRepositoryFactory(client);
            const created = await timelineMutateRepository.createTimeline({
                projectExternalId: input.projectExternalId,
                chargeExternalId: input.chargeExternalId,
                managerExternalId: input.managerExternalId,
                employeeExternalId: input.employeeExternalId,
                employeeName: employee.name,
                comment: input.comment,
            });
            await timelineMutateRepository.replaceTimelineDays(created.id, input.days);
            return { id: created.id };
        });
    }
}
exports.CreateTimelineHandler = CreateTimelineHandler;
let createTimelineHandlerSingleton = null;
function getCreateTimelineHandler() {
    if (!createTimelineHandlerSingleton) {
        createTimelineHandlerSingleton = new CreateTimelineHandler((0, provider_service_1.getProviderService)(), new unit_of_work_1.UnitOfWork());
    }
    return createTimelineHandlerSingleton;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateTimelineHandler = void 0;
exports.getUpdateTimelineHandler = getUpdateTimelineHandler;
const unit_of_work_1 = require("../../../core/db/unit-of-work");
const app_error_1 = require("../../../core/errors/app-error");
const provider_service_1 = require("../../provider/services/provider.service");
const timeline_mutate_pg_1 = require("../data-access/timeline-mutate.pg");
function hasMetaUpdates(input) {
    return (input.projectExternalId !== undefined ||
        input.chargeExternalId !== undefined ||
        input.managerExternalId !== undefined ||
        input.employeeExternalId !== undefined ||
        input.comment !== undefined);
}
class UpdateTimelineHandler {
    providerService;
    timelineMutateRepository;
    unitOfWork;
    timelineMutateRepositoryFactory;
    constructor(providerService, timelineMutateRepository, unitOfWork, timelineMutateRepositoryFactory = (db) => new timeline_mutate_pg_1.PgTimelineMutateRepository(db)) {
        this.providerService = providerService;
        this.timelineMutateRepository = timelineMutateRepository;
        this.unitOfWork = unitOfWork;
        this.timelineMutateRepositoryFactory = timelineMutateRepositoryFactory;
    }
    async execute(input) {
        const current = await this.timelineMutateRepository.findTimelineById(input.id);
        if (!current) {
            throw new app_error_1.AppError({
                status: 404,
                code: "TIMELINE_NOT_FOUND",
                message: "Timeline not found",
            });
        }
        const next = {
            projectExternalId: input.projectExternalId ?? current.projectExternalId,
            chargeExternalId: input.chargeExternalId ?? current.chargeExternalId,
            managerExternalId: input.managerExternalId ?? current.managerExternalId,
            employeeExternalId: input.employeeExternalId ?? current.employeeExternalId,
        };
        let validatedEmployeeName;
        if (input.managerExternalId !== undefined || input.employeeExternalId !== undefined) {
            const employees = await this.providerService.getEmployeesByManager(next.managerExternalId);
            const employee = employees.find((candidate) => candidate.id === next.employeeExternalId);
            if (!employee) {
                throw new app_error_1.AppError({
                    status: 400,
                    code: "EMPLOYEE_MANAGER_MISMATCH",
                    message: "employeeExternalId does not belong to managerExternalId",
                });
            }
            validatedEmployeeName = employee.name;
        }
        if (input.projectExternalId !== undefined || input.chargeExternalId !== undefined) {
            const charges = await this.providerService.getCharges({ projectIds: [next.projectExternalId] });
            const charge = charges.find((candidate) => candidate.id === next.chargeExternalId);
            if (!charge) {
                throw new app_error_1.AppError({
                    status: 400,
                    code: "CHARGE_PROJECT_MISMATCH",
                    message: "chargeExternalId does not belong to projectExternalId",
                });
            }
        }
        await this.unitOfWork.execute(async (client) => {
            const mutateRepository = this.timelineMutateRepositoryFactory(client);
            if (hasMetaUpdates(input)) {
                await mutateRepository.updateTimeline(input.id, {
                    projectExternalId: input.projectExternalId,
                    chargeExternalId: input.chargeExternalId,
                    managerExternalId: input.managerExternalId,
                    employeeExternalId: input.employeeExternalId,
                    employeeName: validatedEmployeeName,
                    comment: input.comment,
                });
            }
            if (input.days) {
                await mutateRepository.replaceTimelineDays(input.id, input.days);
            }
        });
        return { id: input.id };
    }
}
exports.UpdateTimelineHandler = UpdateTimelineHandler;
let updateTimelineHandlerSingleton = null;
function getUpdateTimelineHandler() {
    if (!updateTimelineHandlerSingleton) {
        updateTimelineHandlerSingleton = new UpdateTimelineHandler((0, provider_service_1.getProviderService)(), new timeline_mutate_pg_1.PgTimelineMutateRepository(), new unit_of_work_1.UnitOfWork());
    }
    return updateTimelineHandlerSingleton;
}

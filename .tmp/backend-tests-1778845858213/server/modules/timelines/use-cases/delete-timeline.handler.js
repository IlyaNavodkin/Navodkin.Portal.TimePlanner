"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteTimelineHandler = void 0;
exports.getDeleteTimelineHandler = getDeleteTimelineHandler;
const unit_of_work_1 = require("../../../core/db/unit-of-work");
const app_error_1 = require("../../../core/errors/app-error");
const timeline_mutate_pg_1 = require("../data-access/timeline-mutate.pg");
class DeleteTimelineHandler {
    timelineMutateRepository;
    unitOfWork;
    timelineMutateRepositoryFactory;
    constructor(timelineMutateRepository, unitOfWork, timelineMutateRepositoryFactory = (db) => new timeline_mutate_pg_1.PgTimelineMutateRepository(db)) {
        this.timelineMutateRepository = timelineMutateRepository;
        this.unitOfWork = unitOfWork;
        this.timelineMutateRepositoryFactory = timelineMutateRepositoryFactory;
    }
    async execute(id) {
        const timeline = await this.timelineMutateRepository.findTimelineById(id);
        if (!timeline) {
            throw new app_error_1.AppError({
                status: 404,
                code: "TIMELINE_NOT_FOUND",
                message: "Timeline not found",
            });
        }
        await this.unitOfWork.execute(async (client) => {
            const mutateRepository = this.timelineMutateRepositoryFactory(client);
            await mutateRepository.deleteTimeline(id);
        });
        return { id };
    }
}
exports.DeleteTimelineHandler = DeleteTimelineHandler;
let deleteTimelineHandlerSingleton = null;
function getDeleteTimelineHandler() {
    if (!deleteTimelineHandlerSingleton) {
        deleteTimelineHandlerSingleton = new DeleteTimelineHandler(new timeline_mutate_pg_1.PgTimelineMutateRepository(), new unit_of_work_1.UnitOfWork());
    }
    return deleteTimelineHandlerSingleton;
}

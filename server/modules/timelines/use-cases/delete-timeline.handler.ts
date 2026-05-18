import { UnitOfWork } from "../../../core/db/unit-of-work"
import type { Queryable } from "../../../core/db/queryable"
import { AppError } from "../../../core/errors/app-error"
import type { TimelineMutateRepository } from "../contracts/timeline-mutate.repository"
import { PgTimelineMutateRepository } from "../data-access/timeline-mutate.pg"

interface DeleteTimelineResult {
  id: string
}

export class DeleteTimelineHandler {
  constructor(
    private readonly timelineMutateRepository: TimelineMutateRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly timelineMutateRepositoryFactory: (db: Queryable) => TimelineMutateRepository = (
      db,
    ) => new PgTimelineMutateRepository(db),
  ) {}

  async execute(id: string): Promise<DeleteTimelineResult> {
    const timeline = await this.timelineMutateRepository.findTimelineById(id)
    if (!timeline) {
      throw new AppError({
        status: 404,
        code: "TIMELINE_NOT_FOUND",
        message: "Timeline not found",
      })
    }

    await this.unitOfWork.execute(async (client) => {
      const mutateRepository = this.timelineMutateRepositoryFactory(client)
      await mutateRepository.deleteTimeline(id)
    })

    return { id }
  }
}

let deleteTimelineHandlerSingleton: DeleteTimelineHandler | null = null

export function getDeleteTimelineHandler(): DeleteTimelineHandler {
  if (!deleteTimelineHandlerSingleton) {
    deleteTimelineHandlerSingleton = new DeleteTimelineHandler(
      new PgTimelineMutateRepository(),
      new UnitOfWork(),
    )
  }

  return deleteTimelineHandlerSingleton
}

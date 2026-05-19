import { UnitOfWork } from "../../../core/db/unit-of-work"
import { AppError } from "../../../core/errors/app-error"
import type { Queryable } from "../../../core/db/queryable"
import { getProviderService, type ProviderService } from "../../provider/services/provider.service"
import type { TimelineMutateRepository } from "../contracts/timeline-mutate.repository"
import { PgTimelineMutateRepository } from "../data-access/timeline-mutate.pg"
import type { UpdateTimelineCommand } from "../dto/timeline.dto"

interface UpdateTimelineResult {
  id: string
}

function hasMetaUpdates(input: UpdateTimelineCommand): boolean {
  return (
    input.projectExternalId !== undefined ||
    input.chargeExternalId !== undefined ||
    input.managerExternalId !== undefined ||
    input.employeeExternalId !== undefined ||
    input.comment !== undefined
  )
}

export class UpdateTimelineHandler {
  constructor(
    private readonly providerService: ProviderService,
    private readonly timelineMutateRepository: TimelineMutateRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly timelineMutateRepositoryFactory: (db: Queryable) => TimelineMutateRepository = (
      db,
    ) => new PgTimelineMutateRepository(db),
  ) {}

  async execute(input: UpdateTimelineCommand): Promise<UpdateTimelineResult> {
    const current = await this.timelineMutateRepository.findTimelineById(input.id)
    if (!current) {
      throw new AppError({
        status: 404,
        code: "TIMELINE_NOT_FOUND",
        message: "Timeline not found",
      })
    }

    const next = {
      projectExternalId: input.projectExternalId ?? current.projectExternalId,
      chargeExternalId: input.chargeExternalId ?? current.chargeExternalId,
      managerExternalId: input.managerExternalId ?? current.managerExternalId,
      employeeExternalId: input.employeeExternalId ?? current.employeeExternalId,
    }

    if (input.managerExternalId !== undefined || input.employeeExternalId !== undefined) {
      const employees = await this.providerService.getEmployeesByManager(next.managerExternalId)
      const employee = employees.find((candidate) => candidate.id === next.employeeExternalId)
      if (!employee) {
        throw new AppError({
          status: 400,
          code: "EMPLOYEE_MANAGER_MISMATCH",
          message: "employeeExternalId does not belong to managerExternalId",
        })
      }
    }

    if (input.projectExternalId !== undefined || input.chargeExternalId !== undefined) {
      const charges = await this.providerService.getCharges({ projectIds: [next.projectExternalId] })
      const charge = charges.find((candidate) => candidate.id === next.chargeExternalId)
      if (!charge) {
        throw new AppError({
          status: 400,
          code: "CHARGE_PROJECT_MISMATCH",
          message: "chargeExternalId does not belong to projectExternalId",
        })
      }
    }

    await this.unitOfWork.execute(async (client) => {
      const mutateRepository = this.timelineMutateRepositoryFactory(client)

      if (hasMetaUpdates(input)) {
        await mutateRepository.updateTimeline(input.id, {
          projectExternalId: input.projectExternalId,
          chargeExternalId: input.chargeExternalId,
          managerExternalId: input.managerExternalId,
          employeeExternalId: input.employeeExternalId,
          comment: input.comment,
        })
      }

      if (input.days) {
        await mutateRepository.replaceTimelineDays(input.id, input.days)
      }
    })

    return { id: input.id }
  }
}

let updateTimelineHandlerSingleton: UpdateTimelineHandler | null = null

export function getUpdateTimelineHandler(): UpdateTimelineHandler {
  if (!updateTimelineHandlerSingleton) {
    updateTimelineHandlerSingleton = new UpdateTimelineHandler(
      getProviderService(),
      new PgTimelineMutateRepository(),
      new UnitOfWork(),
    )
  }

  return updateTimelineHandlerSingleton
}

import { UnitOfWork } from "../../../core/db/unit-of-work"
import { AppError } from "../../../core/errors/app-error"
import { getProviderService, type ProviderService } from "../../provider/services/provider.service"
import type { TimelineMutateRepository } from "../contracts/timeline-mutate.repository"
import { PgTimelineMutateRepository } from "../data-access/timeline-mutate.pg"
import type { CreateTimelineCommand } from "../dto/timeline.dto"
import type { Queryable } from "../../../core/db/queryable"

interface CreateTimelineResult {
  id: string
}

export class CreateTimelineHandler {
  constructor(
    private readonly providerService: ProviderService,
    private readonly unitOfWork: UnitOfWork,
    private readonly timelineMutateRepositoryFactory: (db: Queryable) => TimelineMutateRepository = (
      db,
    ) => new PgTimelineMutateRepository(db),
  ) {}

  async execute(input: CreateTimelineCommand): Promise<CreateTimelineResult> {
    const employees = await this.providerService.getEmployeesByManager(input.managerExternalId)
    const employee = employees.find((candidate) => candidate.id === input.employeeExternalId)
    if (!employee) {
      throw new AppError({
        status: 400,
        code: "EMPLOYEE_MANAGER_MISMATCH",
        message: "employeeExternalId does not belong to managerExternalId",
      })
    }

    const charges = await this.providerService.getCharges({ projectIds: [input.projectExternalId] })
    const charge = charges.find((candidate) => candidate.id === input.chargeExternalId)
    if (!charge) {
      throw new AppError({
        status: 400,
        code: "CHARGE_PROJECT_MISMATCH",
        message: "chargeExternalId does not belong to projectExternalId",
      })
    }

    return await this.unitOfWork.execute(async (client) => {
      const timelineMutateRepository = this.timelineMutateRepositoryFactory(client)
      const created = await timelineMutateRepository.createTimeline({
        projectExternalId: input.projectExternalId,
        chargeExternalId: input.chargeExternalId,
        managerExternalId: input.managerExternalId,
        employeeExternalId: input.employeeExternalId,
        comment: input.comment,
      })

      await timelineMutateRepository.replaceTimelineDays(created.id, input.days)

      return { id: created.id }
    })
  }
}

let createTimelineHandlerSingleton: CreateTimelineHandler | null = null

export function getCreateTimelineHandler(): CreateTimelineHandler {
  if (!createTimelineHandlerSingleton) {
    createTimelineHandlerSingleton = new CreateTimelineHandler(getProviderService(), new UnitOfWork())
  }

  return createTimelineHandlerSingleton
}

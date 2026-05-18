import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { AppError } from "../../server/core/errors/app-error"
import type { UnitOfWork } from "../../server/core/db/unit-of-work"
import type { ProviderService } from "../../server/modules/provider/services/provider.service"
import type { TimelineMutateRepository } from "../../server/modules/timelines/contracts/timeline-mutate.repository"
import { CreateTimelineHandler } from "../../server/modules/timelines/use-cases/create-timeline.handler"

describe("CreateTimelineHandler", () => {
  it("creates timeline and days when employee/charge relations are valid", async () => {
    const providerCalls: {
      managerId?: string
      chargeProjectIds?: string[]
    } = {}

    const provider = {
      async getEmployeesByManager(managerId: string) {
        providerCalls.managerId = managerId
        return [{ id: "emp-1", name: "Employee 1", managerId }]
      },
      async getCharges(options?: { projectIds?: string[] }) {
        providerCalls.chargeProjectIds = options?.projectIds
        return [{ id: "ch-1", name: "Charge 1", projectId: "pr-1" }]
      },
    } as unknown as ProviderService

    const repoCalls: {
      createInput?: Parameters<TimelineMutateRepository["createTimeline"]>[0]
      replaceInput?: { timelineId: string; days: string[] }
    } = {}

    const repository: TimelineMutateRepository = {
      async findTimelineById() {
        return null
      },
      async createTimeline(input) {
        repoCalls.createInput = input
        return { id: "timeline-1" }
      },
      async updateTimeline() {},
      async replaceTimelineDays(timelineId, days) {
        repoCalls.replaceInput = { timelineId, days }
      },
      async deleteTimeline() {},
    }

    let uowExecuted = 0
    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        uowExecuted += 1
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new CreateTimelineHandler(provider, unitOfWork, () => repository)
    const result = await handler.execute({
      projectExternalId: "pr-1",
      chargeExternalId: "ch-1",
      managerExternalId: "mgr-1",
      employeeExternalId: "emp-1",
      days: ["2026-05-11", "2026-05-12"],
      comment: "new",
    })

    assert.deepEqual(result, { id: "timeline-1" })
    assert.equal(uowExecuted, 1)
    assert.equal(providerCalls.managerId, "mgr-1")
    assert.deepEqual(providerCalls.chargeProjectIds, ["pr-1"])
    assert.deepEqual(repoCalls.createInput, {
      projectExternalId: "pr-1",
      chargeExternalId: "ch-1",
      managerExternalId: "mgr-1",
      employeeExternalId: "emp-1",
      employeeName: "Employee 1",
      comment: "new",
    })
    assert.deepEqual(repoCalls.replaceInput, {
      timelineId: "timeline-1",
      days: ["2026-05-11", "2026-05-12"],
    })
  })

  it("throws EMPLOYEE_MANAGER_MISMATCH when employee does not belong to manager", async () => {
    const provider = {
      async getEmployeesByManager() {
        return [{ id: "emp-x", name: "Other", managerId: "mgr-1" }]
      },
      async getCharges() {
        throw new Error("must not call getCharges")
      },
    } as unknown as ProviderService

    let uowExecuted = 0
    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        uowExecuted += 1
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new CreateTimelineHandler(provider, unitOfWork, () => {
      throw new Error("repo factory must not be called")
    })

    await assert.rejects(
      handler.execute({
        projectExternalId: "pr-1",
        chargeExternalId: "ch-1",
        managerExternalId: "mgr-1",
        employeeExternalId: "emp-1",
        days: ["2026-05-11"],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 400)
        assert.equal(error.code, "EMPLOYEE_MANAGER_MISMATCH")
        return true
      },
    )

    assert.equal(uowExecuted, 0)
  })

  it("throws CHARGE_PROJECT_MISMATCH when charge does not belong to project", async () => {
    const provider = {
      async getEmployeesByManager(managerId: string) {
        return [{ id: "emp-1", name: "Employee 1", managerId }]
      },
      async getCharges() {
        return [{ id: "ch-x", name: "Other", projectId: "pr-1" }]
      },
    } as unknown as ProviderService

    let uowExecuted = 0
    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        uowExecuted += 1
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new CreateTimelineHandler(provider, unitOfWork, () => {
      throw new Error("repo factory must not be called")
    })

    await assert.rejects(
      handler.execute({
        projectExternalId: "pr-1",
        chargeExternalId: "ch-1",
        managerExternalId: "mgr-1",
        employeeExternalId: "emp-1",
        days: ["2026-05-11"],
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 400)
        assert.equal(error.code, "CHARGE_PROJECT_MISMATCH")
        return true
      },
    )

    assert.equal(uowExecuted, 0)
  })
})

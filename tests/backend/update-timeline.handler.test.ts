import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { AppError } from "../../server/core/errors/app-error"
import type { UnitOfWork } from "../../server/core/db/unit-of-work"
import type { ProviderService } from "../../server/modules/provider/services/provider.service"
import type { TimelineMutateRepository } from "../../server/modules/timelines/contracts/timeline-mutate.repository"
import { UpdateTimelineHandler } from "../../server/modules/timelines/use-cases/update-timeline.handler"

function createCurrentRepo(current: Parameters<TimelineMutateRepository["findTimelineById"]>[0] | null) {
  const timeline =
    current === null
      ? null
      : {
          id: current,
          projectExternalId: "pr-1",
          chargeExternalId: "ch-1",
          managerExternalId: "mgr-1",
          employeeExternalId: "emp-1",
          employeeName: "Old Name",
          comment: "old",
        }

  const repo: TimelineMutateRepository = {
    async findTimelineById() {
      return timeline
    },
    async createTimeline() {
      return { id: "unused" }
    },
    async updateTimeline() {},
    async replaceTimelineDays() {},
    async deleteTimeline() {},
  }

  return repo
}

describe("UpdateTimelineHandler", () => {
  it("updates metadata and days with validated employee name", async () => {
    const providerCalls: {
      managerId?: string
      projectIds?: string[]
    } = {}

    const provider = {
      async getEmployeesByManager(managerId: string) {
        providerCalls.managerId = managerId
        return [{ id: "emp-3", name: "Employee 3", managerId }]
      },
      async getCharges(options?: { projectIds?: string[] }) {
        providerCalls.projectIds = options?.projectIds
        return [{ id: "ch-3", name: "Charge 3", projectId: "pr-2" }]
      },
    } as unknown as ProviderService

    const readRepo = createCurrentRepo("timeline-1")

    const writeCalls: {
      update?: { id: string; input: Parameters<TimelineMutateRepository["updateTimeline"]>[1] }
      replaceDays?: { id: string; days: string[] }
    } = {}

    const writeRepo: TimelineMutateRepository = {
      async findTimelineById() {
        return null
      },
      async createTimeline() {
        return { id: "unused" }
      },
      async updateTimeline(id, input) {
        writeCalls.update = { id, input }
      },
      async replaceTimelineDays(id, days) {
        writeCalls.replaceDays = { id, days }
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

    const handler = new UpdateTimelineHandler(provider, readRepo, unitOfWork, () => writeRepo)

    const result = await handler.execute({
      id: "timeline-1",
      projectExternalId: "pr-2",
      chargeExternalId: "ch-3",
      managerExternalId: "mgr-2",
      employeeExternalId: "emp-3",
      days: ["2026-05-13", "2026-05-14"],
      comment: "updated",
    })

    assert.deepEqual(result, { id: "timeline-1" })
    assert.equal(uowExecuted, 1)
    assert.equal(providerCalls.managerId, "mgr-2")
    assert.deepEqual(providerCalls.projectIds, ["pr-2"])
    assert.deepEqual(writeCalls.update, {
      id: "timeline-1",
      input: {
        projectExternalId: "pr-2",
        chargeExternalId: "ch-3",
        managerExternalId: "mgr-2",
        employeeExternalId: "emp-3",
        employeeName: "Employee 3",
        comment: "updated",
      },
    })
    assert.deepEqual(writeCalls.replaceDays, {
      id: "timeline-1",
      days: ["2026-05-13", "2026-05-14"],
    })
  })

  it("updates only days without metadata write when meta fields are absent", async () => {
    const provider = {
      async getEmployeesByManager() {
        throw new Error("provider must not be called")
      },
      async getCharges() {
        throw new Error("provider must not be called")
      },
    } as unknown as ProviderService

    const readRepo = createCurrentRepo("timeline-1")

    let updateCalled = false
    let replaceCalled = false
    const writeRepo: TimelineMutateRepository = {
      async findTimelineById() {
        return null
      },
      async createTimeline() {
        return { id: "unused" }
      },
      async updateTimeline() {
        updateCalled = true
      },
      async replaceTimelineDays() {
        replaceCalled = true
      },
      async deleteTimeline() {},
    }

    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new UpdateTimelineHandler(provider, readRepo, unitOfWork, () => writeRepo)

    await handler.execute({
      id: "timeline-1",
      days: ["2026-05-20"],
    })

    assert.equal(updateCalled, false)
    assert.equal(replaceCalled, true)
  })

  it("throws EMPLOYEE_MANAGER_MISMATCH on invalid manager-employee relation", async () => {
    const provider = {
      async getEmployeesByManager() {
        return [{ id: "emp-x", name: "Other", managerId: "mgr-2" }]
      },
      async getCharges() {
        return []
      },
    } as unknown as ProviderService

    const readRepo = createCurrentRepo("timeline-1")
    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new UpdateTimelineHandler(provider, readRepo, unitOfWork, () => {
      throw new Error("repo factory must not be called")
    })

    await assert.rejects(
      handler.execute({
        id: "timeline-1",
        managerExternalId: "mgr-2",
        employeeExternalId: "emp-3",
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 400)
        assert.equal(error.code, "EMPLOYEE_MANAGER_MISMATCH")
        return true
      },
    )
  })

  it("throws CHARGE_PROJECT_MISMATCH on invalid project-charge relation", async () => {
    const provider = {
      async getEmployeesByManager() {
        return []
      },
      async getCharges() {
        return [{ id: "ch-x", name: "Other", projectId: "pr-2" }]
      },
    } as unknown as ProviderService

    const readRepo = createCurrentRepo("timeline-1")
    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new UpdateTimelineHandler(provider, readRepo, unitOfWork, () => {
      throw new Error("repo factory must not be called")
    })

    await assert.rejects(
      handler.execute({
        id: "timeline-1",
        projectExternalId: "pr-2",
        chargeExternalId: "ch-3",
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 400)
        assert.equal(error.code, "CHARGE_PROJECT_MISMATCH")
        return true
      },
    )
  })

  it("throws TIMELINE_NOT_FOUND when timeline does not exist", async () => {
    const provider = {
      async getEmployeesByManager() {
        return []
      },
      async getCharges() {
        return []
      },
    } as unknown as ProviderService

    const readRepo = createCurrentRepo(null)
    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new UpdateTimelineHandler(provider, readRepo, unitOfWork, () => {
      throw new Error("repo factory must not be called")
    })

    await assert.rejects(
      handler.execute({ id: "missing" }),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 404)
        assert.equal(error.code, "TIMELINE_NOT_FOUND")
        return true
      },
    )
  })
})

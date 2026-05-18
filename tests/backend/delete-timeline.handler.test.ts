import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { AppError } from "../../server/core/errors/app-error"
import type { UnitOfWork } from "../../server/core/db/unit-of-work"
import type { TimelineMutateRepository } from "../../server/modules/timelines/contracts/timeline-mutate.repository"
import { DeleteTimelineHandler } from "../../server/modules/timelines/use-cases/delete-timeline.handler"

describe("DeleteTimelineHandler", () => {
  it("deletes existing timeline", async () => {
    const readRepo: TimelineMutateRepository = {
      async findTimelineById(id) {
        return {
          id,
          projectExternalId: "pr-1",
          chargeExternalId: "ch-1",
          managerExternalId: "mgr-1",
          employeeExternalId: "emp-1",
        }
      },
      async createTimeline() {
        return { id: "unused" }
      },
      async updateTimeline() {},
      async replaceTimelineDays() {},
      async deleteTimeline() {},
    }

    let deletedId: string | undefined
    const writeRepo: TimelineMutateRepository = {
      async findTimelineById() {
        return null
      },
      async createTimeline() {
        return { id: "unused" }
      },
      async updateTimeline() {},
      async replaceTimelineDays() {},
      async deleteTimeline(id) {
        deletedId = id
      },
    }

    let uowExecuted = 0
    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        uowExecuted += 1
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new DeleteTimelineHandler(readRepo, unitOfWork, () => writeRepo)
    const result = await handler.execute("timeline-1")

    assert.deepEqual(result, { id: "timeline-1" })
    assert.equal(uowExecuted, 1)
    assert.equal(deletedId, "timeline-1")
  })

  it("throws TIMELINE_NOT_FOUND when record is missing", async () => {
    const readRepo: TimelineMutateRepository = {
      async findTimelineById() {
        return null
      },
      async createTimeline() {
        return { id: "unused" }
      },
      async updateTimeline() {},
      async replaceTimelineDays() {},
      async deleteTimeline() {},
    }

    const unitOfWork = {
      async execute<T>(work: (client: unknown) => Promise<T>): Promise<T> {
        return await work({})
      },
    } as unknown as UnitOfWork

    const handler = new DeleteTimelineHandler(readRepo, unitOfWork, () => {
      throw new Error("repo factory must not be called")
    })

    await assert.rejects(
      handler.execute("missing"),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.status, 404)
        assert.equal(error.code, "TIMELINE_NOT_FOUND")
        return true
      },
    )
  })
})

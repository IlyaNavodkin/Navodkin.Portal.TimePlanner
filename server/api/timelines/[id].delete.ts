import { defineEventHandler, getRouterParam } from "h3"

import { AppError, withAppErrorHandling } from "../../core/errors/app-error"
import { getDeleteTimelineHandler } from "../../modules/timelines/use-cases/delete-timeline.handler"

function requireTimelineId(value: string | undefined): string {
  if (!value) {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Path param id is required",
    })
  }

  const normalized = value.trim()
  if (!normalized) {
    throw new AppError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Path param id is required",
    })
  }

  return normalized
}

export default defineEventHandler(async (event) => {
  return await withAppErrorHandling(event, async () => {
    const id = requireTimelineId(getRouterParam(event, "id"))
    return await getDeleteTimelineHandler().execute(id)
  })
})

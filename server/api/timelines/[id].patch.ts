import { defineEventHandler, getRouterParam, readBody } from "h3"

import { AppError, withAppErrorHandling } from "../../core/errors/app-error"
import {
  parseObjectBody,
  parseOptionalDaysField,
  parseOptionalStringField,
} from "../../core/utils/timeline-write-validation"
import { getUpdateTimelineHandler } from "../../modules/timelines/use-cases/update-timeline.handler"

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
    const body = parseObjectBody(await readBody(event))

    const patchInput = {
      id,
      projectExternalId: parseOptionalStringField(body, "projectExternalId"),
      chargeExternalId: parseOptionalStringField(body, "chargeExternalId"),
      managerExternalId: parseOptionalStringField(body, "managerExternalId"),
      employeeExternalId: parseOptionalStringField(body, "employeeExternalId"),
      comment: parseOptionalStringField(body, "comment"),
      days: parseOptionalDaysField(body),
    }

    const hasAnyField =
      patchInput.projectExternalId !== undefined ||
      patchInput.chargeExternalId !== undefined ||
      patchInput.managerExternalId !== undefined ||
      patchInput.employeeExternalId !== undefined ||
      patchInput.comment !== undefined ||
      patchInput.days !== undefined

    if (!hasAnyField) {
      throw new AppError({
        status: 400,
        code: "VALIDATION_ERROR",
        message:
          "At least one field must be provided: projectExternalId, chargeExternalId, managerExternalId, employeeExternalId, comment, days",
      })
    }

    return await getUpdateTimelineHandler().execute(patchInput)
  })
})

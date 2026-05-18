import { defineEventHandler, readBody, setResponseStatus } from "h3"

import { withAppErrorHandling } from "../../core/errors/app-error"
import {
  parseObjectBody,
  parseRequiredDaysField,
  parseRequiredStringField,
} from "../../core/utils/timeline-write-validation"
import { getCreateTimelineHandler } from "../../modules/timelines/use-cases/create-timeline.handler"

export default defineEventHandler(async (event) => {
  return await withAppErrorHandling(event, async () => {
    const body = parseObjectBody(await readBody(event))
    const result = await getCreateTimelineHandler().execute({
      projectExternalId: parseRequiredStringField(body, "projectExternalId"),
      chargeExternalId: parseRequiredStringField(body, "chargeExternalId"),
      managerExternalId: parseRequiredStringField(body, "managerExternalId"),
      employeeExternalId: parseRequiredStringField(body, "employeeExternalId"),
      days: parseRequiredDaysField(body),
      comment: body.comment === undefined ? undefined : parseRequiredStringField(body, "comment"),
    })

    setResponseStatus(event, 201)
    return result
  })
})

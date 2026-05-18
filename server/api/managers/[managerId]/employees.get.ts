import { defineEventHandler, getRouterParam } from "h3"

import { AppError, withAppErrorHandling } from "../../../core/errors/app-error"
import { getProviderService } from "../../../modules/provider/services/provider.service"

export default defineEventHandler(async (event) => {
  return await withAppErrorHandling(event, async () => {
    const managerId = getRouterParam(event, "managerId")
    if (!managerId) {
      throw new AppError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Path param managerId is required",
      })
    }

    return await getProviderService().getEmployeesByManager(managerId)
  })
})

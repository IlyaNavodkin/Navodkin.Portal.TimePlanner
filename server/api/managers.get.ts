import { defineEventHandler } from "h3"

import { withAppErrorHandling } from "../core/errors/app-error"
import { getProviderService } from "../modules/provider/services/provider.service"

export default defineEventHandler(async (event) => {
  return await withAppErrorHandling(event, async () => {
    return await getProviderService().getManagers()
  })
})

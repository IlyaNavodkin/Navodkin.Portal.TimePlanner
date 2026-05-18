import type { NextFunction, Request, Response } from "express";
import { keycloakProvisioningUseCase } from "../../auth/usecases/KeycloakProvisioningUseCase.js";
import { mapAdminHttpError } from "../httpErrors.js";

export async function postAdminOidcBootstrap(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await keycloakProvisioningUseCase.ensureFromRuntimeConfig();
    res.json(result);
  } catch (err) {
    next(mapAdminHttpError(err));
  }
}

import { AdminReadDataContext } from "./ReadDataContext.js";
import { AdminMutateDataContext } from "./MutateDataContext.js";

export const adminReadCtx = new AdminReadDataContext();
export const adminMutateCtx = new AdminMutateDataContext();

export type { IAdminReadContext, IAdminMutateContext } from "./interfaces.js";
export * from "./dto.js";

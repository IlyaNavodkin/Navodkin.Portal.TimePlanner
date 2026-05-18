import { AuthReadDataContext } from "./ReadDataContext.js";
import { AuthMutateDataContext } from "./MutateDataContext.js";

export const authReadCtx = new AuthReadDataContext();
export const authMutateCtx = new AuthMutateDataContext();

export type { IAuthReadContext, IAuthMutateContext } from "./interfaces.js";
export * from "./dto.js";

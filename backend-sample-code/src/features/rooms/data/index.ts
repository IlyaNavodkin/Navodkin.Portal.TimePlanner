import { RoomReadDataContext } from "./ReadDataContext.js";
import { RoomMutateDataContext } from "./MutateDataContext.js";

export const roomsReadCtx = new RoomReadDataContext();
export const roomsMutateCtx = new RoomMutateDataContext();

export type { IRoomReadContext, IRoomMutateContext } from "./interfaces.js";
export * from "./dto.js";

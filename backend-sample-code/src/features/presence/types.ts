import type { WebSocket } from "ws";

export interface PresenceClient {
  identity: string;
  room: string | null;
}

export interface RoomMeta {
  icon: string;
  color: string;
}

export type PresenceClients = Map<WebSocket, PresenceClient>;
export type RoomMetaMap = Map<string, RoomMeta>;

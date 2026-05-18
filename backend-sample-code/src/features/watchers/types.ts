import type { WebSocket } from "ws";

export interface WatcherClient {
  identity: string;
  streamKey: string; // "${roomName}/${publisherIdentity}"
}

export type WatcherClients = Map<WebSocket, WatcherClient>;
export type WatcherRooms = Map<string, Set<WebSocket>>;

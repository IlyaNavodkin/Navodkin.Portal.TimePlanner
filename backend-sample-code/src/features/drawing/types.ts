import type { WebSocket } from "ws";

export interface DrawClient {
  clientId: string;
  identity: string;
  roomId: string;
  color: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface StrokeRecord {
  id: string;
  tool: string;
  color: string;
  width: number;
  points: Point[];
  identity: string;
  clientId: string;
}

export interface DrawSession {
  strokes: StrokeRecord[];
  createdBy: string;
  colorIndex: number;
}

export type DrawClients = Map<WebSocket, DrawClient>;
export type DrawRooms = Map<string, Set<WebSocket>>;
export type DrawSessions = Map<string, DrawSession>;

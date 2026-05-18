import type { WebSocket } from "ws";

function roomUserKey(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}

const activeRoomConnectionByUser = new Map<string, WebSocket>();

export function claimActiveRoomConnection(roomId: string, userId: string, ws: WebSocket): WebSocket | null {
  const key = roomUserKey(roomId, userId);
  const existingWs = activeRoomConnectionByUser.get(key);
  activeRoomConnectionByUser.set(key, ws);
  if (!existingWs || existingWs === ws || existingWs.readyState !== existingWs.OPEN) {
    return null;
  }
  return existingWs;
}

export function releaseActiveRoomConnection(roomId: string, userId: string, ws: WebSocket): void {
  const key = roomUserKey(roomId, userId);
  if (activeRoomConnectionByUser.get(key) === ws) {
    activeRoomConnectionByUser.delete(key);
  }
}

export function hasActiveRoomConnection(roomId: string, userId: string): boolean {
  const key = roomUserKey(roomId, userId);
  const existingWs = activeRoomConnectionByUser.get(key);
  return Boolean(existingWs && existingWs.readyState === existingWs.OPEN);
}

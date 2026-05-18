import { db } from "../../../shared/db/database.js";
import { roomsReadCtx as readCtx, roomsMutateCtx as mutateCtx, type RoomDto, type RoomRoleDto, type RoomParticipantDto, type RoomBanDto } from "../data/index.js";
import { authReadCtx } from "../../auth/data/index.js";
export type { RoomParticipantDto };
import {
  DEFAULT_ROLE_PERMISSIONS,
  GUEST_ROLE_PERMISSIONS,
  OWNER_ROLE_PERMISSIONS,
} from "../constants.js";
import type { RolePermissions } from "../../../shared/db/types.js";
const MAX_MEMBER_CREATED_ROOMS = 2;

interface CreateRoomInput {
  name: string;
  description?: string;
  isPrivate?: boolean;
  password?: string;
}

interface UpdateRoomInput {
  description?: string;
  isPrivate?: boolean;
  password?: string | null;
}

interface CreateRoomRoleInput {
  name: string;
  color?: string;
  isDefault?: boolean;
  permissions?: Partial<RolePermissions>;
}

interface UpdateRoomRoleInput {
  name?: string;
  color?: string;
  isDefault?: boolean;
  permissions?: Partial<RolePermissions>;
}

export class RoomUseCase {
  // ── Rooms ──────────────────────────────────────────────────────────────────

  async createRoom(userId: string, userRole: string, data: CreateRoomInput): Promise<RoomDto> {
    if (userRole !== "member" && userRole !== "admin") {
      throw new Error("Only members and admins can create rooms");
    }

    if (userRole === "member") {
      const createdRoomsCount = await readCtx.countRoomsCreatedByUser(userId);
      if (createdRoomsCount >= MAX_MEMBER_CREATED_ROOMS) {
        throw new Error(`Room limit reached: members can create up to ${MAX_MEMBER_CREATED_ROOMS} rooms`);
      }
    }

    const existing = await readCtx.getRoomByName(data.name);
    if (existing) throw new Error("Room name already taken");

    const room = await mutateCtx.createRoom({
      name: data.name,
      description: data.description,
      createdBy: userId,
      isPrivate: data.isPrivate ?? false,
      password: data.isPrivate ? data.password : undefined,
    });

    // Add creator as owner (no role_id — owner is special system role)
    await mutateCtx.addRoomMember({
      roomId: room.id,
      userId,
      roomRole: "owner",
      roleId: null,
    });

    await mutateCtx.createRoomRole({
      roomId: room.id,
      name: "Guest",
      color: "#6b7280",
      isDefault: true,
      permissions: { ...GUEST_ROLE_PERMISSIONS },
    });

    return room;
  }

  async getRooms(): Promise<RoomDto[]> {
    return readCtx.getRooms();
  }

  async getRoom(id: string): Promise<RoomDto & { participants: RoomParticipantDto[]; roles: RoomRoleDto[] }> {
    const room = await readCtx.getRoomById(id);
    if (!room) throw new Error("Room not found");
    const [participants, roles] = await Promise.all([
      readCtx.getRoomParticipants(id),
      readCtx.getRoomRoles(id),
    ]);
    return { ...room, participants, roles };
  }

  async updateRoom(userId: string, userRole: string, roomId: string, data: UpdateRoomInput): Promise<void> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    await this._assertCanManageRoom(userId, userRole, roomId, room.createdBy);

    await mutateCtx.updateRoom(roomId, {
      description: data.description,
      isPrivate: data.isPrivate,
      password: data.isPrivate === false ? null : data.password,
    });
  }

  async deleteRoom(userId: string, userRole: string, roomId: string): Promise<void> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    if (room.createdBy !== userId && userRole !== "admin") {
      throw new Error("Not authorized to delete this room");
    }

    await mutateCtx.deleteRoom(roomId);
  }

  // ── Join ───────────────────────────────────────────────────────────────────

  async joinRoomAsMember(userId: string, roomName: string, password?: string): Promise<RoomDto> {
    const room = await readCtx.getRoomByName(roomName);
    if (!room) throw new Error("Room not found");

    const user = await authReadCtx.getUserById(userId);
    if (!user) throw new Error("User not found");

    // Global admins always keep access to all rooms.
    if (user.roleName !== "admin") {
      const isRoomBanned = await readCtx.isRoomBanned(room.id, userId);
      if (isRoomBanned) throw new Error("You are banned from this room");
    } else {
      // Cleanup stale bans so promoted admins are not blocked by historical records.
      await mutateCtx.removeRoomBan(room.id, userId);
    }

    if (room.isPrivate) {
      if (!password) throw new Error("Password required for private room");
      await this._validateRoomPassword(room.id, password);
    }

    // Already a member: keep existing room role/permissions intact.
    // This prevents accidental demotion (e.g. owner -> participant) on repeated joins.
    const existingParticipants = await readCtx.getRoomParticipants(room.id);
    const alreadyMember = existingParticipants.some((p) => p.id === userId);
    if (alreadyMember) return room;

    const defaultRole = await readCtx.getDefaultRoomRole(room.id);

    await mutateCtx.addRoomMember({
      roomId: room.id,
      userId,
      roomRole: "participant",
      roleId: defaultRole?.id ?? null,
    });

    return room;
  }

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    await mutateCtx.removeRoomMember(roomId, userId);
  }

  async getMembers(roomId: string): Promise<RoomParticipantDto[]> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");
    return readCtx.getRoomParticipants(roomId);
  }

  // ── Role assignment ────────────────────────────────────────────────────────

  async assignMemberRole(
    requesterId: string,
    requesterGlobalRole: string,
    roomId: string,
    targetUserId: string,
    roleId: string | null,
  ): Promise<RoomParticipantDto> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    await this._assertCanManageRoles(requesterId, requesterGlobalRole, roomId, room.createdBy);

    if (roleId !== null) {
      const role = await readCtx.getRoomRoleById(roleId);
      if (!role || role.roomId !== roomId) throw new Error("Role not found in this room");
    }

    await mutateCtx.updateRoomMember(roomId, targetUserId, { roleId });

    const participants = await readCtx.getRoomParticipants(roomId);
    const updated = participants.find(p => p.type === "member" && p.id === targetUserId);
    if (!updated) throw new Error("Participant not found after role assignment");
    return updated;
  }

  async kickParticipant(
    requesterId: string,
    requesterGlobalRole: string,
    roomId: string,
    targetId: string,
  ): Promise<void> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");
    if (targetId === requesterId) throw new Error("Cannot kick yourself");
    if (room.createdBy === targetId) throw new Error("Cannot moderate room owner");

    const targetUser = await authReadCtx.getUserById(targetId);
    if (!targetUser) throw new Error("Target user not found");
    if (targetUser.roleName === "admin") throw new Error("Cannot moderate admin");

    if (requesterGlobalRole !== "admin" && room.createdBy !== requesterId) {
      const participants = await readCtx.getRoomParticipants(roomId);
      const requester = this._findParticipant(participants, requesterId);
      if (!requester?.permissions.canKick) throw new Error("Not authorized to kick");
    }

    await mutateCtx.removeRoomMember(roomId, targetId);
  }

  // ── Ban ─────────────────────────────────────────────────────────────────────

  async banParticipant(
    requesterId: string,
    requesterGlobalRole: string,
    roomId: string,
    targetId: string,
  ): Promise<void> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    if (targetId === requesterId) throw new Error("Cannot ban yourself");
    if (room.createdBy === targetId) throw new Error("Cannot moderate room owner");

    const targetUser = await authReadCtx.getUserById(targetId);
    if (!targetUser) throw new Error("Target user not found");
    if (targetUser.roleName === "admin") throw new Error("Cannot moderate admin");

    if (requesterGlobalRole !== "admin" && room.createdBy !== requesterId) {
      const participants = await readCtx.getRoomParticipants(roomId);
      const requester = this._findParticipant(participants, requesterId);
      if (!requester?.permissions.canBan) throw new Error("Not authorized to ban");
    }

    // Remove from room if currently a member
    await mutateCtx.removeRoomMember(roomId, targetId);
    // Add ban record
    await mutateCtx.addRoomBan(roomId, targetId, requesterId);
  }

  async unbanParticipant(
    requesterId: string,
    requesterGlobalRole: string,
    roomId: string,
    targetId: string,
  ): Promise<void> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    if (requesterGlobalRole !== "admin" && room.createdBy !== requesterId) {
      const participants = await readCtx.getRoomParticipants(roomId);
      const requester = this._findParticipant(participants, requesterId);
      if (!requester?.permissions.canBan) throw new Error("Not authorized to unban");
    }

    await mutateCtx.removeRoomBan(roomId, targetId);
  }

  async getRoomBans(
    requesterId: string,
    requesterGlobalRole: string,
    roomId: string,
  ): Promise<RoomBanDto[]> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    if (requesterGlobalRole !== "admin" && room.createdBy !== requesterId) {
      const participants = await readCtx.getRoomParticipants(roomId);
      const requester = this._findParticipant(participants, requesterId);
      if (!requester?.permissions.canBan) throw new Error("Not authorized to view bans");
    }

    return readCtx.getRoomBans(roomId);
  }

  // ── Room roles ─────────────────────────────────────────────────────────────

  async getRoomRoles(roomId: string): Promise<RoomRoleDto[]> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");
    return readCtx.getRoomRoles(roomId);
  }

  async createRoomRole(
    userId: string,
    userRole: string,
    roomId: string,
    data: CreateRoomRoleInput,
  ): Promise<RoomRoleDto> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    await this._assertCanManageRoles(userId, userRole, roomId, room.createdBy);

    if (data.isDefault) {
      await mutateCtx.clearDefaultRoomRole(roomId);
    }

    const permissions: RolePermissions = { ...DEFAULT_ROLE_PERMISSIONS, ...(data.permissions ?? {}) };

    return mutateCtx.createRoomRole({
      roomId,
      name: data.name,
      color: data.color ?? "#6366f1",
      isDefault: data.isDefault ?? false,
      permissions,
    });
  }

  async updateRoomRole(
    userId: string,
    userRole: string,
    roomId: string,
    roleId: string,
    data: UpdateRoomRoleInput,
  ): Promise<void> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    await this._assertCanManageRoles(userId, userRole, roomId, room.createdBy);

    const role = await readCtx.getRoomRoleById(roleId);
    if (!role || role.roomId !== roomId) throw new Error("Role not found in this room");

    if (data.isDefault) {
      await mutateCtx.clearDefaultRoomRole(roomId);
    }

    await mutateCtx.updateRoomRole(roleId, data);
  }

  async deleteRoomRole(
    userId: string,
    userRole: string,
    roomId: string,
    roleId: string,
  ): Promise<void> {
    const room = await readCtx.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    await this._assertCanManageRoles(userId, userRole, roomId, room.createdBy);

    const role = await readCtx.getRoomRoleById(roleId);
    if (!role || role.roomId !== roomId) throw new Error("Role not found in this room");

    await mutateCtx.deleteRoomRole(roleId);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _validateRoomPassword(roomId: string, password: string): Promise<void> {
    const raw = await db
      .selectFrom("rooms")
      .select("password")
      .where("id", "=", roomId)
      .executeTakeFirst();
    if (!raw?.password) throw new Error("Room password not configured");
    if (raw.password !== password) throw new Error("Invalid room password");
  }

  private _findParticipant(
    participants: RoomParticipantDto[],
    userId: string,
  ): RoomParticipantDto | undefined {
    return participants.find((p) => p.id === userId);
  }

  private async _assertCanManageRoom(
    userId: string,
    globalRole: string,
    roomId: string,
    createdBy: string | null,
  ): Promise<void> {
    if (createdBy === userId || globalRole === "admin") return;
    const participants = await readCtx.getRoomParticipants(roomId);
    const p = this._findParticipant(participants, userId);
    if (!p?.permissions.canManageRoom) {
      throw new Error("Not authorized to update this room");
    }
  }

  private async _assertCanManageRoles(
    userId: string,
    globalRole: string,
    roomId: string,
    createdBy: string | null,
  ): Promise<void> {
    if (createdBy === userId || globalRole === "admin") return;
    const participants = await readCtx.getRoomParticipants(roomId);
    const p = this._findParticipant(participants, userId);
    if (!p?.permissions.canManageRoles) {
      throw new Error("Not authorized to manage roles in this room");
    }
  }
}

export const roomUseCase = new RoomUseCase();

import type { RolePermissions } from "../../../shared/db/types.js";

export interface RoomDto {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  isPrivate: boolean;
  createdAt: Date;
}

export interface RoomRoleDto {
  id: string;
  roomId: string;
  name: string;
  color: string;
  isDefault: boolean;
  permissions: RolePermissions;
  createdAt: Date;
}

export interface RoomMemberDto {
  roomId: string;
  userId: string;
  username: string;
  roomRole: string;
  roleId: string | null;
  roleName: string | null;
  roleColor: string | null;
  permissions: RolePermissions;
  joinedAt: Date;
}

export interface RoomParticipantDto {
  type: 'member';
  /** userId */
  id: string;
  username: string;
  roomRole: string;
  roleId: string | null;
  roleName: string | null;
  roleColor: string | null;
  permissions: RolePermissions;
  joinedAt: Date;
}

export interface RoomBanDto {
  roomId: string;
  userId: string;
  username: string;
  bannedBy: string;
  bannedByUsername: string;
  bannedAt: Date;
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateRoomData {
  name: string;
  description?: string;
  createdBy: string;
  isPrivate: boolean;
  password?: string;
}

export interface UpdateRoomData {
  description?: string;
  isPrivate?: boolean;
  password?: string | null;
}

export interface CreateRoomRoleData {
  roomId: string;
  name: string;
  color: string;
  isDefault: boolean;
  permissions: RolePermissions;
}

export interface UpdateRoomRoleData {
  name?: string;
  color?: string;
  isDefault?: boolean;
  permissions?: Partial<RolePermissions>;
}

export interface AddRoomMemberData {
  roomId: string;
  userId: string;
  roomRole: string;
  roleId?: string | null;
}

export interface UpdateMemberData {
  roomRole?: string;
  roleId?: string | null;
}

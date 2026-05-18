import type { RolePermissions } from "../../shared/db/types.js";

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  canMic: true,
  canCamera: true,
  canScreenShare: true,
  canChat: true,
  canFileShare: true,
  canDrawing: true,
  canListenRadio: true,
  canManageRadio: false,
  canKick: false,
  canMute: false,
  canBan: false,
  canManageRoom: false,
  canManageRoles: false,
};

export const OWNER_ROLE_PERMISSIONS: RolePermissions = {
  canMic: true,
  canCamera: true,
  canScreenShare: true,
  canChat: true,
  canFileShare: true,
  canDrawing: true,
  canListenRadio: true,
  canManageRadio: true,
  canKick: true,
  canMute: true,
  canBan: true,
  canManageRoom: true,
  canManageRoles: true,
};

export const GUEST_ROLE_PERMISSIONS: RolePermissions = {
  canMic: true,
  canCamera: true,
  canScreenShare: true,
  canChat: true,
  canFileShare: true,
  canDrawing: true,
  canListenRadio: true,
  canManageRadio: true,
  canKick: false,
  canMute: false,
  canBan: false,
  canManageRoom: false,
  canManageRoles: false,
};

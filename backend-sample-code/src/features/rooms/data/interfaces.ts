import type {
  RoomDto,
  RoomRoleDto,
  RoomMemberDto,
  RoomParticipantDto,
  RoomBanDto,
  CreateRoomData,
  UpdateRoomData,
  CreateRoomRoleData,
  UpdateRoomRoleData,
  AddRoomMemberData,
  UpdateMemberData,
} from "./dto.js";

export interface IRoomReadContext {
  getRoomById(id: string): Promise<RoomDto | null>;
  getRoomByName(name: string): Promise<RoomDto | null>;
  countRoomsCreatedByUser(userId: string): Promise<number>;
  getRooms(): Promise<RoomDto[]>;
  getRoomRoles(roomId: string): Promise<RoomRoleDto[]>;
  getRoomRoleById(roleId: string): Promise<RoomRoleDto | null>;
  getDefaultRoomRole(roomId: string): Promise<RoomRoleDto | null>;
  getRoomMembers(roomId: string): Promise<RoomMemberDto[]>;
  getRoomParticipants(roomId: string): Promise<RoomParticipantDto[]>;
  isRoomBanned(roomId: string, userId: string): Promise<boolean>;
  getRoomBans(roomId: string): Promise<RoomBanDto[]>;
}

export interface IRoomMutateContext {
  createRoom(data: CreateRoomData): Promise<RoomDto>;
  updateRoom(roomId: string, data: UpdateRoomData): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  createRoomRole(data: CreateRoomRoleData): Promise<RoomRoleDto>;
  updateRoomRole(roleId: string, data: UpdateRoomRoleData): Promise<void>;
  deleteRoomRole(roleId: string): Promise<void>;
  clearDefaultRoomRole(roomId: string): Promise<void>;
  addRoomMember(data: AddRoomMemberData): Promise<void>;
  updateRoomMember(roomId: string, userId: string, data: UpdateMemberData): Promise<void>;
  removeRoomMember(roomId: string, userId: string): Promise<void>;
  addRoomBan(roomId: string, userId: string, bannedBy: string): Promise<void>;
  removeRoomBan(roomId: string, userId: string): Promise<void>;
}

import { db } from "../../../shared/db/database.js";
import type { IRoomMutateContext } from "./interfaces.js";
import type {
  RoomDto,
  RoomRoleDto,
  CreateRoomData,
  UpdateRoomData,
  CreateRoomRoleData,
  UpdateRoomRoleData,
  AddRoomMemberData,
  UpdateMemberData,
} from "./dto.js";
import { RoomReadDataContext } from "./ReadDataContext.js";
import { DEFAULT_ROLE_PERMISSIONS } from "../constants.js";

const read = new RoomReadDataContext();

export class RoomMutateDataContext implements IRoomMutateContext {
  async createRoom(data: CreateRoomData): Promise<RoomDto> {
    const row = await db
      .insertInto("rooms")
      .values({
        name: data.name,
        description: data.description ?? null,
        created_by: data.createdBy,
        is_private: data.isPrivate,
        password: data.password ?? null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return (await read.getRoomById(row.id))!;
  }

  async updateRoom(roomId: string, data: UpdateRoomData): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (data.description !== undefined) updates.description = data.description;
    if (data.isPrivate !== undefined) updates.is_private = data.isPrivate;
    if (data.password !== undefined) updates.password = data.password;

    if (Object.keys(updates).length === 0) return;

    await db
      .updateTable("rooms")
      .set(updates)
      .where("id", "=", roomId)
      .execute();
  }

  async deleteRoom(roomId: string): Promise<void> {
    await db.deleteFrom("rooms").where("id", "=", roomId).execute();
  }

  async createRoomRole(data: CreateRoomRoleData): Promise<RoomRoleDto> {
    const row = await db
      .insertInto("room_roles")
      .values({
        room_id: data.roomId,
        name: data.name,
        color: data.color,
        is_default: data.isDefault,
        permissions: JSON.stringify(data.permissions),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return (await read.getRoomRoleById(row.id))!;
  }

  async updateRoomRole(roleId: string, data: UpdateRoomRoleData): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.color !== undefined) updates.color = data.color;
    if (data.isDefault !== undefined) updates.is_default = data.isDefault;
    if (data.permissions !== undefined) {
      const existing = await read.getRoomRoleById(roleId);
      const merged = { ...DEFAULT_ROLE_PERMISSIONS, ...(existing?.permissions ?? {}), ...data.permissions };
      updates.permissions = JSON.stringify(merged);
    }

    if (Object.keys(updates).length === 0) return;

    await db
      .updateTable("room_roles")
      .set(updates)
      .where("id", "=", roleId)
      .execute();
  }

  async deleteRoomRole(roleId: string): Promise<void> {
    await db.deleteFrom("room_roles").where("id", "=", roleId).execute();
  }

  async clearDefaultRoomRole(roomId: string): Promise<void> {
    await db
      .updateTable("room_roles")
      .set({ is_default: false })
      .where("room_id", "=", roomId)
      .execute();
  }

  async addRoomMember(data: AddRoomMemberData): Promise<void> {
    await db
      .insertInto("room_members")
      .values({
        room_id: data.roomId,
        user_id: data.userId,
        room_role: data.roomRole,
        role_id: data.roleId ?? null,
      })
      .onConflict((oc) =>
        oc.columns(["room_id", "user_id"]).doUpdateSet({
          room_role: data.roomRole,
          role_id: data.roleId ?? null,
        })
      )
      .execute();
  }

  async updateRoomMember(roomId: string, userId: string, data: UpdateMemberData): Promise<void> {
    const updates: Record<string, unknown> = {};
    if (data.roomRole !== undefined) updates.room_role = data.roomRole;
    if (data.roleId !== undefined) updates.role_id = data.roleId;

    if (Object.keys(updates).length === 0) return;

    await db
      .updateTable("room_members")
      .set(updates)
      .where("room_id", "=", roomId)
      .where("user_id", "=", userId)
      .execute();
  }

  async removeRoomMember(roomId: string, userId: string): Promise<void> {
    await db
      .deleteFrom("room_members")
      .where("room_id", "=", roomId)
      .where("user_id", "=", userId)
      .execute();
  }

  async addRoomBan(roomId: string, userId: string, bannedBy: string): Promise<void> {
    await db
      .insertInto("room_bans")
      .values({
        room_id: roomId,
        user_id: userId,
        banned_by: bannedBy,
      })
      .onConflict((oc) =>
        oc.columns(["room_id", "user_id"]).doUpdateSet({
          banned_by: bannedBy,
        })
      )
      .execute();
  }

  async removeRoomBan(roomId: string, userId: string): Promise<void> {
    await db
      .deleteFrom("room_bans")
      .where("room_id", "=", roomId)
      .where("user_id", "=", userId)
      .execute();
  }
}

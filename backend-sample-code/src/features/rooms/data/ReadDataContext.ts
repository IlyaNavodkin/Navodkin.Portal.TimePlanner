import { db } from "../../../shared/db/database.js";
import type { IRoomReadContext } from "./interfaces.js";
import type { RoomDto, RoomRoleDto, RoomMemberDto, RoomParticipantDto, RoomBanDto } from "./dto.js";
import type { RolePermissions } from "../../../shared/db/types.js";
import { DEFAULT_ROLE_PERMISSIONS, OWNER_ROLE_PERMISSIONS } from "../constants.js";

function withDefaultPermissions(permissions?: Partial<RolePermissions> | null): RolePermissions {
  return { ...DEFAULT_ROLE_PERMISSIONS, ...(permissions ?? {}) };
}

export class RoomReadDataContext implements IRoomReadContext {
  async getRoomById(id: string): Promise<RoomDto | null> {
    const row = await db
      .selectFrom("rooms")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? mapRoom(row) : null;
  }

  async getRoomByName(name: string): Promise<RoomDto | null> {
    const row = await db
      .selectFrom("rooms")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();
    return row ? mapRoom(row) : null;
  }

  async countRoomsCreatedByUser(userId: string): Promise<number> {
    const result = await db
      .selectFrom("rooms")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("created_by", "=", userId)
      .executeTakeFirstOrThrow();

    return Number(result.count ?? 0);
  }

  async getRooms(): Promise<RoomDto[]> {
    const rows = await db
      .selectFrom("rooms")
      .selectAll()
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(mapRoom);
  }

  async getRoomRoles(roomId: string): Promise<RoomRoleDto[]> {
    const rows = await db
      .selectFrom("room_roles")
      .selectAll()
      .where("room_id", "=", roomId)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(mapRoomRole);
  }

  async getRoomRoleById(roleId: string): Promise<RoomRoleDto | null> {
    const row = await db
      .selectFrom("room_roles")
      .selectAll()
      .where("id", "=", roleId)
      .executeTakeFirst();
    return row ? mapRoomRole(row) : null;
  }

  async getDefaultRoomRole(roomId: string): Promise<RoomRoleDto | null> {
    const row = await db
      .selectFrom("room_roles")
      .selectAll()
      .where("room_id", "=", roomId)
      .where("is_default", "=", true)
      .executeTakeFirst();
    return row ? mapRoomRole(row) : null;
  }

  async getRoomMembers(roomId: string): Promise<RoomMemberDto[]> {
    const rows = await db
      .selectFrom("room_members as rm")
      .innerJoin("users as u", "u.id", "rm.user_id")
      .leftJoin("room_roles as rr", "rr.id", "rm.role_id")
      .select([
        "rm.room_id",
        "rm.user_id",
        "u.username",
        "rm.room_role",
        "rm.role_id",
        "rr.name as role_name",
        "rr.color as role_color",
        "rr.permissions as role_permissions",
        "rm.joined_at",
      ])
      .where("rm.room_id", "=", roomId)
      .execute();
    return rows.map((row) => mapRoomMember(row));
  }

  async getRoomParticipants(roomId: string): Promise<RoomParticipantDto[]> {
    const memberRows = await db
      .selectFrom("room_members as rm")
      .innerJoin("users as u", "u.id", "rm.user_id")
      .leftJoin("room_roles as rr", "rr.id", "rm.role_id")
      .select([
        "rm.user_id as id",
        "u.username",
        "rm.room_role",
        "rm.role_id",
        "rr.name as role_name",
        "rr.color as role_color",
        "rr.permissions as role_permissions",
        "rm.joined_at",
      ])
      .where("rm.room_id", "=", roomId)
      .execute();

    const members: RoomParticipantDto[] = memberRows.map((r) => {
      let permissions: RolePermissions;
      if (r.room_role === "owner") {
        permissions = { ...OWNER_ROLE_PERMISSIONS };
      } else if (r.role_permissions) {
        permissions = withDefaultPermissions(r.role_permissions as Partial<RolePermissions>);
      } else {
        permissions = { ...DEFAULT_ROLE_PERMISSIONS };
      }
      return {
        type: "member",
        id: r.id,
        username: r.username,
        roomRole: r.room_role,
        roleId: r.role_id,
        roleName: r.role_name ?? null,
        roleColor: r.role_color ?? null,
        permissions,
        joinedAt: r.joined_at,
      };
    });

    return members.sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
  }

  async isRoomBanned(roomId: string, userId: string): Promise<boolean> {
    const row = await db
      .selectFrom("room_bans")
      .select("room_id")
      .where("room_id", "=", roomId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return !!row;
  }

  async getRoomBans(roomId: string): Promise<RoomBanDto[]> {
    const rows = await db
      .selectFrom("room_bans as rb")
      .innerJoin("users as u", "u.id", "rb.user_id")
      .innerJoin("users as b", "b.id", "rb.banned_by")
      .select([
        "rb.room_id",
        "rb.user_id",
        "u.username",
        "rb.banned_by",
        "b.username as banned_by_username",
        "rb.banned_at",
      ])
      .where("rb.room_id", "=", roomId)
      .orderBy("rb.banned_at", "desc")
      .execute();
    return rows.map((r) => ({
      roomId: r.room_id,
      userId: r.user_id,
      username: r.username,
      bannedBy: r.banned_by,
      bannedByUsername: r.banned_by_username,
      bannedAt: r.banned_at,
    }));
  }
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

type RoomRow = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  is_private: boolean;
  password: string | null;
  created_at: Date;
};

function mapRoom(row: RoomRow): RoomDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    isPrivate: row.is_private,
    createdAt: row.created_at,
  };
}

type RoomRoleRow = {
  id: string;
  room_id: string;
  name: string;
  color: string;
  is_default: boolean;
  permissions: RolePermissions;
  created_at: Date;
};

function mapRoomRole(row: RoomRoleRow): RoomRoleDto {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    color: row.color,
    isDefault: row.is_default,
    permissions: withDefaultPermissions(row.permissions),
    createdAt: row.created_at,
  };
}

type RoomMemberRow = {
  room_id: string;
  user_id: string;
  username: string;
  room_role: string;
  role_id: string | null;
  role_name: string | null;
  role_color: string | null;
  role_permissions: RolePermissions | null;
  joined_at: Date;
};

function mapRoomMember(row: RoomMemberRow): RoomMemberDto {
  let permissions: RolePermissions;
  if (row.room_role === "owner") {
    permissions = { ...OWNER_ROLE_PERMISSIONS };
  } else if (row.role_permissions) {
    permissions = withDefaultPermissions(row.role_permissions);
  } else {
    permissions = { ...DEFAULT_ROLE_PERMISSIONS };
  }

  return {
    roomId: row.room_id,
    userId: row.user_id,
    username: row.username,
    roomRole: row.room_role,
    roleId: row.role_id,
    roleName: row.role_name,
    roleColor: row.role_color,
    permissions,
    joinedAt: row.joined_at,
  };
}

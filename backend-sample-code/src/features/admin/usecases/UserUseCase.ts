import { authReadCtx as readCtx, authMutateCtx as mutateCtx, type UserDto, type UserFilters } from "../../auth/data/index.js";
import { authUseCase } from "../../auth/usecases/AuthUseCase.js";
import { adminReadCtx, adminMutateCtx, type AppBanDto } from "../data/index.js";
import { closeSocketsBySessionIds } from "../../../shared/ws-auth.js";

export class UserUseCase {
  async getUsers(filters?: UserFilters): Promise<UserDto[]> {
    return readCtx.getUsers(filters);
  }

  async updateRole(adminId: string, userId: string, roleId: number): Promise<UserDto> {
    if (adminId === userId) throw new Error("Cannot change your own role");

    const user = await readCtx.getUserById(userId);
    if (!user) throw new Error("User not found");

    const roles = await readCtx.getRoles();
    if (!roles.find((r) => r.id === roleId)) throw new Error("Role not found");

    await mutateCtx.updateUserRole(userId, roleId);
    return (await readCtx.getUserById(userId))!;
  }

  async deleteUser(adminId: string, userId: string): Promise<void> {
    if (adminId === userId) throw new Error("Cannot delete yourself");
    const user = await readCtx.getUserById(userId);
    if (!user) throw new Error("User not found");
    const revoked = await authUseCase.revokeUserSessions(userId, "admin-delete-user");
    closeSocketsBySessionIds(revoked, 4403, "user-deleted");
    await mutateCtx.deleteUser(userId);
  }

  // ── App bans ────────────────────────────────────────────────────────────────

  async banUser(adminId: string, userId: string, reason?: string): Promise<void> {
    if (adminId === userId) throw new Error("Cannot ban yourself");
    const user = await readCtx.getUserById(userId);
    if (!user) throw new Error("User not found");
    await adminMutateCtx.addAppBan(userId, adminId, reason);
    const revoked = await authUseCase.revokeUserSessions(userId, "app-ban");
    closeSocketsBySessionIds(revoked, 4403, "app-banned");
  }

  async unbanUser(adminId: string, userId: string): Promise<void> {
    const user = await readCtx.getUserById(userId);
    if (!user) throw new Error("User not found");
    await adminMutateCtx.removeAppBan(userId);
  }

  async getAppBans(): Promise<AppBanDto[]> {
    return adminReadCtx.getAppBans();
  }
}

export const userUseCase = new UserUseCase();

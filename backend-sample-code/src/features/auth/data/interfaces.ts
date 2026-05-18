import type {
  UserDto,
  RoleDto,
  UserFilters,
  CreateUserData,
  UpdateUserOidcData,
  AuthSessionDto,
  CreateAuthSessionData,
  RotateAuthSessionData,
} from "./dto.js";

export interface IAuthReadContext {
  getUserById(id: string): Promise<UserDto | null>;
  getUserByUsername(username: string): Promise<UserDto | null>;
  getUsers(filters?: UserFilters): Promise<UserDto[]>;
  findUserByOidc(provider: string, sub: string): Promise<UserDto | null>;
  getAuthSessionById(id: string): Promise<AuthSessionDto | null>;
  getActiveAuthSessionsByKeycloakSid(sid: string): Promise<AuthSessionDto[]>;
  getActiveAuthSessionsByKeycloakSub(sub: string): Promise<AuthSessionDto[]>;
  getRoles(): Promise<RoleDto[]>;
  getRoleByName(name: string): Promise<RoleDto | null>;
}

export interface IAuthMutateContext {
  createUser(data: CreateUserData): Promise<UserDto>;
  updateUserRole(userId: string, roleId: number): Promise<void>;
  updateUserOidc(userId: string, data: UpdateUserOidcData): Promise<void>;
  createAuthSession(data: CreateAuthSessionData): Promise<void>;
  rotateAuthSession(data: RotateAuthSessionData): Promise<boolean>;
  touchAuthSession(sessionId: string): Promise<void>;
  revokeAuthSession(sessionId: string, reason?: string): Promise<void>;
  revokeUserAuthSessions(userId: string, reason?: string): Promise<string[]>;
  revokeAuthSessionsByKeycloakSid(sid: string, reason?: string): Promise<string[]>;
  revokeAuthSessionsByKeycloakSub(sub: string, reason?: string): Promise<string[]>;
  revokeAllAuthSessions(reason?: string): Promise<string[]>;
  deleteUser(userId: string): Promise<void>;
}

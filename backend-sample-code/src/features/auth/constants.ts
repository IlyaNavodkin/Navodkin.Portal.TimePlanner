export const GLOBAL_PERMISSIONS = {
  member: {
    mic: true,
    camera: true,
    screenShare: true,
    chat: true,
    createRoom: true,
    manageUsers: false,
    ban: false,
  },
  admin: {
    mic: true,
    camera: true,
    screenShare: true,
    chat: true,
    createRoom: true,
    manageUsers: true,
    ban: true,
  },
} as const;

export type GlobalRole = keyof typeof GLOBAL_PERMISSIONS;

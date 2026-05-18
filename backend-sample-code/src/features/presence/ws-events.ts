export const WS_PATH = {
  PRESENCE: "/ws",
} as const;

export const WS_PRESENCE = {
  CONNECTED: "presence:connected" as const,
  JOIN: "presence:join" as const,
  UNJOIN: "presence:unjoin" as const,
  ROOM_META: "presence:room_meta" as const,
  USER_LIST: "presence:user_list" as const,
  AVATAR_UPDATED: "presence:avatar_updated" as const,
  AVATAR_VERSIONS: "presence:avatar_versions" as const,
};

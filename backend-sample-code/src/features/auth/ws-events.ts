export const WS_PATH = {
  AUTH: "/ws/auth",
} as const;

export const WS_AUTH = {
  PING: "auth:ping" as const,
  PONG: "auth:pong" as const,
  REFRESH_REQUIRED: "auth:refresh_required" as const,
  LOGOUT_REQUIRED: "auth:logout_required" as const,
};

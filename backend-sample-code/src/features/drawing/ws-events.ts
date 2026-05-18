export const WS_PATH = {
  DRAW: "/ws/draw",
} as const;

export const WS_DRAW = {
  // client → server
  CREATE_SESSION: "draw:create_session" as const,
  DESTROY_SESSION: "draw:destroy_session" as const,
  JOIN: "draw:join" as const,
  LEAVE: "draw:leave" as const,
  CURSOR_MOVE: "draw:cursor_move" as const,
  STROKE_PREVIEW: "draw:stroke_preview" as const,
  STROKE: "draw:stroke" as const,
  ERASE: "draw:erase" as const,
  CLEAR_OWN: "draw:clear_own" as const,
  // server → client
  WELCOME: "draw:welcome" as const,
  USERS: "draw:users" as const,
  STROKE_HISTORY: "draw:stroke_history" as const,
  SESSION_ENDED: "draw:session_ended" as const,
  CURSOR_REMOVED: "draw:cursor_removed" as const,
  REMOTE_CURSOR: "draw:remote_cursor" as const,
  REMOTE_STROKE_PREVIEW: "draw:remote_stroke_preview" as const,
  REMOTE_STROKE: "draw:remote_stroke" as const,
  REMOTE_ERASE: "draw:remote_erase" as const,
  REMOTE_CLEAR: "draw:remote_clear" as const,
};

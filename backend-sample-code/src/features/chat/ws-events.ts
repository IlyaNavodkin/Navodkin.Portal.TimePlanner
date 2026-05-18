export const WS_PATH = {
  CHAT: "/ws/chat",
} as const;

export const WS_CHAT = {
  JOIN: "chat:join" as const,
  MESSAGE: "chat:message" as const,
  FILE_META: "chat:file_meta" as const,
  FILE_CHUNK: "chat:file_chunk" as const,
  FILE_END: "chat:file_end" as const,
  // server → client
  HISTORY: "chat:history" as const,
  REMOTE_MESSAGE: "chat:remote_message" as const,
  REMOTE_FILE_META: "chat:remote_file_meta" as const,
  REMOTE_FILE_CHUNK: "chat:remote_file_chunk" as const,
  REMOTE_FILE_END: "chat:remote_file_end" as const,
};

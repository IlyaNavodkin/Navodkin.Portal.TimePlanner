export const WS_PATH = {
  WATCHERS: "/ws/watchers",
} as const;

export const WS_WATCHER = {
  WATCH: "watcher:watch" as const,
  UNWATCH: "watcher:unwatch" as const,
  LIST: "watcher:list" as const,
};

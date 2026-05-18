type ServerLogLevel = "debug" | "info" | "warn" | "error";

const levelWeight: Record<ServerLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function readServerLogLevel(): ServerLogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function isEnabled(level: ServerLogLevel): boolean {
  return levelWeight[level] >= levelWeight[readServerLogLevel()];
}

function format(scope: string, message: string): string {
  return `${new Date().toISOString()} [${scope}] ${message}`;
}

function normalizeMeta(meta?: unknown): unknown {
  if (meta instanceof Error) {
    return { name: meta.name, message: meta.message, stack: meta.stack };
  }
  return meta;
}

export function createLogger(scope: string) {
  return {
    debug(message: string, meta?: unknown) {
      if (!isEnabled("debug")) return;
      if (meta !== undefined) {
        console.debug(format(scope, message), normalizeMeta(meta));
        return;
      }
      console.debug(format(scope, message));
    },
    info(message: string, meta?: unknown) {
      if (!isEnabled("info")) return;
      if (meta !== undefined) {
        console.info(format(scope, message), normalizeMeta(meta));
        return;
      }
      console.info(format(scope, message));
    },
    warn(message: string, meta?: unknown) {
      if (!isEnabled("warn")) return;
      if (meta !== undefined) {
        console.warn(format(scope, message), normalizeMeta(meta));
        return;
      }
      console.warn(format(scope, message));
    },
    error(message: string, meta?: unknown) {
      if (!isEnabled("error")) return;
      if (meta !== undefined) {
        console.error(format(scope, message), normalizeMeta(meta));
        return;
      }
      console.error(format(scope, message));
    },
  };
}

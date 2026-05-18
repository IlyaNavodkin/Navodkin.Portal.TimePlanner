import { ERROR_CODES } from "./shared/error-codes.js";
import http from "http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { WebSocketServer } from "ws";
import { BRANDING_DIR, PORT } from "./shared/config.js";
import { swaggerSpec } from "./shared/swagger.js";
import { setBanCheck, setSessionCheck } from "./shared/middleware/auth.js";
import { errorHandler } from "./shared/middleware/error-handler.js";
import { authenticateWsRequest, bindSocketSession } from "./shared/ws-auth.js";
import { ensureTraceId } from "./shared/errors.js";
import livekitRouter from "./features/livekit/routes.js";
import avatarsRouter from "./features/avatars/routes.js";
import radioRouter from "./features/radio/routes.js";
import migrateRouter from "./features/migrations/routes.js";
import authRouter from "./features/auth/routes.js";
import roomsRouter from "./features/rooms/routes.js";
import rolesRouter from "./features/rooms/routes-roles.js";
import adminRouter from "./features/admin/routes.js";
import logsRouter from "./features/logs/routes.js";
import brandingRouter from "./features/branding/routes.js";
import { setupPresenceWss } from "./features/presence/ws/presence.js";
import { setupDrawingWss } from "./features/drawing/ws/drawing.js";
import { setupWatchersWss } from "./features/watchers/ws/watchers.js";
import { setupRadioWss } from "./features/radio/ws/radio.js";
import { setupRoomWss } from "./features/rooms/ws/room.js";
import { setupChatWss } from "./features/chat/ws/chat.js";
import { setupAuthWss } from "./features/auth/ws/auth.js";
import { migrationService } from "./features/migrations/services/MigrationService.js";
import { adminReadCtx } from "./features/admin/data/index.js";
import { authUseCase } from "./features/auth/usecases/AuthUseCase.js";
import { defaultAdminUseCase } from "./features/auth/usecases/DefaultAdminUseCase.js";
import { WS_PATH as AUTH_WS } from "./features/auth/ws-events.js";
import { WS_PATH as PRESENCE_WS } from "./features/presence/ws-events.js";
import { WS_PATH as DRAW_WS } from "./features/drawing/ws-events.js";
import { WS_PATH as WATCHERS_WS } from "./features/watchers/ws-events.js";
import { WS_PATH as RADIO_WS } from "./features/radio/ws-events.js";
import { WS_PATH as ROOM_WS } from "./features/rooms/ws-events.js";
import { WS_PATH as CHAT_WS } from "./features/chat/ws-events.js";
import { createLogger } from "./shared/logger.js";
import { logRetentionService } from "./features/logs/LogRetentionService.js";

const logger = createLogger("server");

// Wire up ban check for auth middleware
setBanCheck((userId) => adminReadCtx.isAppBanned(userId));
setSessionCheck((sessionId, userId) => authUseCase.isSessionActive(sessionId, userId));

const app = express();
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  "/api/branding-assets",
  express.static(BRANDING_DIR, {
    maxAge: "365d",
    immutable: true,
  }),
);
app.get("/api/branding-assets/:filename", (req, res, next) => {
  const filename = (req.params["filename"] as string | undefined)?.toLowerCase() ?? "";
  if (filename.startsWith("logo.")) {
    logger.warn("Branding logo asset missing, using default logo fallback", { filename });
    res.redirect(302, "/logo/logo-invisible.svg");
    return;
  }
  if (filename.startsWith("favicon.")) {
    logger.warn("Branding favicon asset missing, using default favicon fallback", { filename });
    res.redirect(302, "/logo/logo-flat.svg");
    return;
  }
  next();
});

// Swagger UI
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/docs.json", (_req, res) => res.json(swaggerSpec));

// Routes
app.use(authRouter);
app.use(roomsRouter);
app.use(rolesRouter);
app.use(adminRouter);
app.use(logsRouter);
app.use(brandingRouter);
app.use(livekitRouter);
app.use(avatarsRouter);
app.use(radioRouter);
app.use(migrateRouter);
app.use(errorHandler);

// HTTP server
const server = http.createServer(app);

// WebSocket servers (noServer — manual upgrade routing)
const presenceWss = new WebSocketServer({ noServer: true });
const drawWss = new WebSocketServer({ noServer: true });
const watchersWss = new WebSocketServer({ noServer: true });
const radioWss = new WebSocketServer({ noServer: true });
const roomWss = new WebSocketServer({ noServer: true });
const chatWss = new WebSocketServer({ noServer: true });
const authWss = new WebSocketServer({ noServer: true });

setupPresenceWss(presenceWss);
setupDrawingWss(drawWss);
setupWatchersWss(watchersWss);
setupRadioWss(radioWss);
setupRoomWss(roomWss);
setupChatWss(chatWss);
setupAuthWss(authWss);

server.on("upgrade", async (req, socket, head) => {
  const auth = await authenticateWsRequest(req);
  if (!auth) {
    const traceId = ensureTraceId(req.headers["x-request-id"]);
    const body = JSON.stringify({
      error: {
        code: ERROR_CODES.AUTH_WS_UNAUTHORIZED,
        message: "Missing or invalid authentication token",
        traceId,
      },
    });
    socket.write(
      `HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
    socket.destroy();
    return;
  }

  const { pathname } = new URL(req.url!, `http://${req.headers.host}`);
  if (pathname === DRAW_WS.DRAW) {
    drawWss.handleUpgrade(req, socket, head, (ws) => {
      bindSocketSession(ws, auth.sessionMeta);
      drawWss.emit("connection", ws, req);
    });
  } else if (pathname === WATCHERS_WS.WATCHERS) {
    watchersWss.handleUpgrade(req, socket, head, (ws) => {
      bindSocketSession(ws, auth.sessionMeta);
      watchersWss.emit("connection", ws, req);
    });
  } else if (pathname === PRESENCE_WS.PRESENCE) {
    presenceWss.handleUpgrade(req, socket, head, (ws) => {
      bindSocketSession(ws, auth.sessionMeta);
      presenceWss.emit("connection", ws, req);
    });
  } else if (pathname === RADIO_WS.RADIO) {
    radioWss.handleUpgrade(req, socket, head, (ws) => {
      bindSocketSession(ws, auth.sessionMeta);
      radioWss.emit("connection", ws, req);
    });
  } else if (pathname === ROOM_WS.ROOM) {
    roomWss.handleUpgrade(req, socket, head, (ws) => {
      bindSocketSession(ws, auth.sessionMeta);
      roomWss.emit("connection", ws, req);
    });
  } else if (pathname === CHAT_WS.CHAT) {
    chatWss.handleUpgrade(req, socket, head, (ws) => {
      bindSocketSession(ws, auth.sessionMeta);
      chatWss.emit("connection", ws, req);
    });
  } else if (pathname === AUTH_WS.AUTH) {
    authWss.handleUpgrade(req, socket, head, (ws) => {
      bindSocketSession(ws, auth.sessionMeta);
      authWss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Bootstrap DB (create migrations table) then start server
migrationService.bootstrap()
  .then(async () => {
    logger.info("DB bootstrap: migrations table ready");
    const appliedMigrations = await migrationService.applyAllPending();
    logger.info("DB migrations applied", {
      appliedCount: appliedMigrations.length,
      applied: appliedMigrations,
    });
    const defaultAdminResult = await defaultAdminUseCase.ensureFromEnv();
    logger.info("Default admin bootstrap result", defaultAdminResult);
    logger.info("OIDC provisioning is manual via /api/admin/oidc/bootstrap");
    logRetentionService.start();
    server.listen(PORT, () => {
      logger.info("Server started", {
        port: PORT,
        swaggerUrl: `http://localhost:${PORT}/api/docs`,
      });
    });
  })
  .catch((err) => {
    logger.error("DB bootstrap failed", err);
    process.exit(1);
  });

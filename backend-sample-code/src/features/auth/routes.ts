import { ERROR_CODES } from "../../shared/error-codes.js";
/**
 * @openapi
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

import { Router } from "express";
import { authUseCase } from "./usecases/AuthUseCase.js";
import { oidcUseCase } from "./usecases/OidcUseCase.js";
import { authReadCtx as readCtx } from "./data/index.js";
import { authenticate } from "../../shared/middleware/auth.js";
import { closeSocketsBySessionIds } from "../../shared/ws-auth.js";
import { GLOBAL_PERMISSIONS } from "./constants.js";
import { CLIENT_BASE_URL } from "./config.js";
import { getOidcRuntimeConfig } from "./usecases/OidcRuntimeConfig.js";
import { AppError } from "../../shared/errors.js";
import { mapAuthHttpError } from "./httpErrors.js";
import { asyncRoute } from "../../shared/middleware/async-route.js";

const router = Router();

function sanitizeClientRedirect(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (!input.startsWith("/") || input.startsWith("//")) return null;
  return input;
}

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with username and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: JWT token and user info
 *       401:
 *         description: Invalid credentials
 */
router.post("/api/auth/login", async (req, res, next) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    next(new AppError({
      status: 400,
      code: ERROR_CODES.AUTH_VALIDATION_ERROR,
      message: "username and password are required",
    }));
    return;
  }
  try {
    const result = await authUseCase.login(username, password);
    res.json(result);
  } catch (err) {
    next(mapAuthHttpError(err));
  }
});

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new account (role = member)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created — JWT token and user info
 *       409:
 *         description: Username already taken
 */
router.post("/api/auth/register", async (req, res, next) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    next(new AppError({
      status: 400,
      code: ERROR_CODES.AUTH_VALIDATION_ERROR,
      message: "username and password are required",
    }));
    return;
  }
  try {
    const result = await authUseCase.register(username, password);
    res.status(201).json(result);
  } catch (err) {
    next(mapAuthHttpError(err));
  }
});

router.post("/api/auth/refresh", async (req, res, next) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    next(new AppError({
      status: 400,
      code: ERROR_CODES.AUTH_REFRESH_REQUIRED,
      message: "refreshToken is required",
    }));
    return;
  }

  try {
    const result = await authUseCase.refresh(refreshToken);
    res.json(result);
  } catch (err) {
    next(mapAuthHttpError(err));
  }
});

router.post("/api/auth/logout", authenticate, async (req, res, next) => {
  try {
    const sessionId = req.user?.jti;
    if (!sessionId) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.AUTH_SESSION_ID_MISSING,
        message: "session id is missing",
      }));
      return;
    }
    await authUseCase.logout(sessionId);
    closeSocketsBySessionIds([sessionId], 4401, "logout");
    res.status(204).end();
  } catch (err) {
    next(mapAuthHttpError(err));
  }
});

/**
 * @openapi
 * /api/roles:
 *   get:
 *     tags: [Auth]
 *     summary: Get all roles
 *     responses:
 *       200:
 *         description: Array of roles
 */
router.get("/api/roles", asyncRoute(async (_req, res) => {
  const roles = await readCtx.getRoles();
  res.json(roles);
}));

/**
 * @openapi
 * /api/permissions:
 *   get:
 *     tags: [Auth]
 *     summary: Get global permissions map for all roles
 *     responses:
 *       200:
 *         description: Permissions by role name
 */
router.get("/api/permissions", (_req, res) => {
  res.json(GLOBAL_PERMISSIONS);
});

// ─── /api/auth/me ─────────────────────────────────────────────────────────────

router.get("/api/auth/me", authenticate, asyncRoute(async (req, res, next) => {
  const user = await readCtx.getUserById(req.user!.sub);
  if (!user) {
    next(new AppError({
      status: 404,
      code: ERROR_CODES.AUTH_USER_NOT_FOUND,
      message: "User not found",
    }));
    return;
  }
  res.json(user);
}));

// ─── /api/auth/config ─────────────────────────────────────────────────────────

router.get("/api/auth/config", asyncRoute(async (_req, res) => {
  const cfg = await getOidcRuntimeConfig();
  res.json({ oidcEnabled: cfg.enabled, providerName: cfg.providerName });
}));

// ─── OIDC routes (only active when OIDC_ENABLED=true) ─────────────────────────

router.get("/api/auth/oidc/login", asyncRoute(async (req, res, next) => {
  const cfg = await getOidcRuntimeConfig();
  if (!cfg.enabled) {
    next(new AppError({
      status: 404,
      code: ERROR_CODES.AUTH_OIDC_DISABLED,
      message: "OIDC not enabled",
    }));
    return;
  }
  try {
    const redirect = sanitizeClientRedirect(req.query["redirect"]);
    const { codeVerifier, codeChallenge, state } = oidcUseCase.generatePkce();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    res.cookie("oidc_state", state, { httpOnly: true, sameSite: "lax", maxAge });
    res.cookie("oidc_cv", codeVerifier, { httpOnly: true, sameSite: "lax", maxAge });
    if (redirect) {
      res.cookie("oidc_redirect", redirect, { httpOnly: true, sameSite: "lax", maxAge });
    } else {
      res.clearCookie("oidc_redirect");
    }
    const url = await oidcUseCase.getAuthorizationUrl(state, codeChallenge);
    res.redirect(url);
  } catch (err) {
    console.error("[OIDC] login error:", err);
    next(new AppError({
      status: 500,
      code: ERROR_CODES.AUTH_OIDC_LOGIN_INIT_FAILED,
      message: "Failed to initiate OIDC login",
    }));
  }
}));

router.get("/api/auth/oidc/callback", asyncRoute(async (req, res, next) => {
  const cfg = await getOidcRuntimeConfig();
  if (!cfg.enabled) {
    next(new AppError({
      status: 404,
      code: ERROR_CODES.AUTH_OIDC_DISABLED,
      message: "OIDC not enabled",
    }));
    return;
  }
  try {
    const cookies = req.cookies as Record<string, string | undefined>;
    const storedState = cookies["oidc_state"];
    const codeVerifier = cookies["oidc_cv"];
    const redirect = sanitizeClientRedirect(cookies["oidc_redirect"]);

    if (!storedState || !codeVerifier) {
      next(new AppError({
        status: 400,
        code: ERROR_CODES.AUTH_OIDC_SESSION_COOKIES_MISSING,
        message: "Missing OIDC session cookies",
      }));
      return;
    }

    res.clearCookie("oidc_state");
    res.clearCookie("oidc_cv");
    res.clearCookie("oidc_redirect");

    const params = req.query as Record<string, string>;
    const { accessToken, refreshToken } = await oidcUseCase.handleCallback(params, storedState, codeVerifier);

    // Redirect to a public route so frontend auth guards don't drop the token
    const callbackUrl = new URL(`${CLIENT_BASE_URL}/login`);
    callbackUrl.searchParams.set("token", accessToken);
    callbackUrl.searchParams.set("refresh", refreshToken);
    if (redirect) callbackUrl.searchParams.set("redirect", redirect);
    res.redirect(callbackUrl.toString());
  } catch (err) {
    console.error("[OIDC] callback error:", err);
    res.redirect(`${CLIENT_BASE_URL}/login?error=oidc_failed`);
  }
}));

router.post("/api/auth/oidc/backchannel-logout", asyncRoute(async (req, res, next) => {
  const cfg = await getOidcRuntimeConfig();
  if (!cfg.enabled) {
    next(new AppError({
      status: 404,
      code: ERROR_CODES.AUTH_OIDC_DISABLED,
      message: "OIDC not enabled",
    }));
    return;
  }

  const logoutToken = (req.body as { logout_token?: string })?.logout_token;
  if (!logoutToken) {
    next(new AppError({
      status: 400,
      code: ERROR_CODES.AUTH_OIDC_LOGOUT_TOKEN_REQUIRED,
      message: "logout_token is required",
    }));
    return;
  }

  try {
    // NOTE: signature verification should be done against Keycloak JWKS.
    // Current implementation validates claims shape and issuer/client checks.
    const [, payloadRaw] = logoutToken.split(".");
    if (!payloadRaw) throw new Error("Malformed logout token");
    const payload = JSON.parse(Buffer.from(payloadRaw, "base64url").toString("utf-8")) as {
      iss?: string;
      aud?: string | string[];
      sid?: string;
      sub?: string;
      events?: Record<string, unknown>;
    };

    if (payload.iss !== cfg.issuer) throw new Error("Issuer mismatch");
    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audList.includes(cfg.clientId)) throw new Error("Audience mismatch");
    if (!payload.events || !("http://schemas.openid.net/event/backchannel-logout" in payload.events)) {
      throw new Error("Invalid logout events claim");
    }

    const revokedSessionIds = await authUseCase.revokeOidcSessions({
      sid: payload.sid,
      sub: payload.sub,
      reason: "oidc-backchannel-logout",
    });
    closeSocketsBySessionIds(revokedSessionIds, 4401, "oidc-revoked");
    res.status(204).end();
  } catch (err) {
    next(mapAuthHttpError(err));
  }
}));

router.get("/api/auth/oidc/logout", (_req, res) => {
  const fallback = `${CLIENT_BASE_URL}/login`;
  getOidcRuntimeConfig()
    .then((cfg) => {
      if (!cfg.enabled) {
        res.redirect(fallback);
        return;
      }
      const issuer = cfg.issuer.replace(/\/+$/, "");
      const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);
      logoutUrl.searchParams.set("client_id", cfg.clientId);
      logoutUrl.searchParams.set("post_logout_redirect_uri", fallback);
      res.redirect(logoutUrl.toString());
    })
    .catch((err) => {
      console.error("[OIDC] logout error:", err);
      res.redirect(fallback);
    });
});

export default router;

import { ERROR_CODES } from "../error-codes.js";
import { Request, Response, NextFunction } from "express";
import type { JwtPayload } from "../../features/auth/types.js";
import { AppError } from "../errors.js";

type Role = JwtPayload["role"];

// Returns middleware that allows only the specified roles
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError({
        status: 401,
        code: ERROR_CODES.AUTH_NOT_AUTHENTICATED,
        message: "Not authenticated",
      }));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError({
        status: 403,
        code: ERROR_CODES.AUTH_INSUFFICIENT_ROLE,
        message: "Insufficient role",
      }));
      return;
    }
    next();
  };
}

import { RequestHandler } from "express";
import { verifyToken } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { hasPermission } from "../lib/permissions";
import { PermissionKey } from "../constants/permissions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: number; name: string; email: string; role: "MASTER" | "BRANCH_MANAGER" | "STAFF" };
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "You must be logged in to do that." },
    });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "This account no longer exists." },
      });
    }
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Your session has expired. Please log in again." },
    });
  }
};

// Use after requireAuth. MASTER always passes; BRANCH_MANAGER/STAFF only
// pass if a granted RolePermission row exists for this key.
export function requirePermission(key: PermissionKey): RequestHandler {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "You must be logged in to do that." } });
    }
    const allowed = await hasPermission(req.user.role, key);
    if (!allowed) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "You don't have permission to do that." },
      });
    }
    next();
  };
}

// Use after requireAuth for actions only MASTER can ever do, regardless
// of the permissions matrix (e.g. editing the matrix itself).
export const requireMaster: RequestHandler = (req, res, next) => {
  if (!req.user || req.user.role !== "MASTER") {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Only the master account can do that." },
    });
  }
  next();
};

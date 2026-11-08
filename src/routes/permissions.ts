import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireMaster } from "../middleware/auth";
import { PERMISSIONS, isValidPermissionKey } from "../constants/permissions";
import { zodErrorsToFields } from "../lib/zodErrors";

export const permissionsRouter = Router();

// Only MASTER can ever view or edit this — not gated by the permissions
// matrix itself, since that would let a role grant itself more access.
permissionsRouter.use(requireAuth, requireMaster);

// GET /permissions
// Returns the full catalog plus current granted state for each
// togglable role (MASTER is omitted — it's always fully granted).
permissionsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.rolePermission.findMany();
    const grantedMap = new Map(rows.map((r) => [`${r.role}:${r.permissionKey}`, r.granted]));

    const roles = ["BRANCH_MANAGER", "STAFF"] as const;
    const data = PERMISSIONS.map((p) => ({
      key: p.key,
      label: p.label,
      group: p.group,
      roles: Object.fromEntries(roles.map((role) => [role, grantedMap.get(`${role}:${p.key}`) ?? false])),
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        role: z.enum(["BRANCH_MANAGER", "STAFF"]),
        permissionKey: z.string(),
        granted: z.boolean(),
      })
    )
    .min(1, "No changes were sent."),
});

// PUT /permissions — bulk upsert a batch of (role, permissionKey, granted) rows
permissionsRouter.put("/", async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }

    const invalid = parsed.data.updates.find((u) => !isValidPermissionKey(u.permissionKey));
    if (invalid) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: `Unknown permission key: ${invalid.permissionKey}` },
      });
    }

    await prisma.$transaction(
      parsed.data.updates.map((u) =>
        prisma.rolePermission.upsert({
          where: { role_permissionKey: { role: u.role, permissionKey: u.permissionKey } },
          update: { granted: u.granted },
          create: { role: u.role, permissionKey: u.permissionKey, granted: u.granted },
        })
      )
    );

    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

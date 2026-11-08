import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { zodErrorsToFields } from "../lib/zodErrors";
import { toPublicUser } from "../lib/publicUser";
import { requireAuth, requirePermission } from "../middleware/auth";
import { NotFoundError, DuplicateNameError } from "../lib/errors";
import { createUserInputSchema, updateUserInputSchema } from "../validation/userSchema";

export const usersRouter = Router();

// Every route here is staff management — gated behind the "staff.manage"
// permission (MASTER always has it; BRANCH_MANAGER/STAFF only if granted).
usersRouter.use(requireAuth, requirePermission("staff.manage"));

// GET /users
usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { id: "asc" } });
    res.json({ data: users.map(toPublicUser) });
  } catch (err) {
    next(err);
  }
});

// POST /users — create a new staff/manager/master account
usersRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createUserInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }
    const { name, email, password, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new DuplicateNameError("An account with this email already exists.");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash, role } });
    res.status(201).json({ data: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

// PUT /users/:id — edit name/email/role, optionally reset password
usersRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const parsed = updateUserInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }

    const current = await prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundError("Staff account not found.");

    const { name, email, role, password } = parsed.data;

    const duplicate = await prisma.user.findFirst({ where: { id: { not: id }, email } });
    if (duplicate) throw new DuplicateNameError("An account with this email already exists.");

    const data: { name: string; email: string; role: typeof role; passwordHash?: string } = { name, email, role };
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({ where: { id }, data });
    res.json({ data: toPublicUser(updated) });
  } catch (err) {
    next(err);
  }
});

// DELETE /users/:id
usersRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (req.user!.id === id) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "You can't delete your own account while logged in as it." },
      });
    }
    const current = await prisma.user.findUnique({ where: { id } });
    if (!current) throw new NotFoundError("Staff account not found.");

    await prisma.user.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

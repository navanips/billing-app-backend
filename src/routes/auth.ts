import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/auth";
import {
  loginInputSchema,
  registerInputSchema,
  forgotPasswordInputSchema,
  resetPasswordInputSchema,
} from "../validation/authSchema";
import { updateProfileInputSchema, changePasswordInputSchema } from "../validation/profileSchema";
import { zodErrorsToFields } from "../lib/zodErrors";
import { requireAuth } from "../middleware/auth";
import { toPublicUser } from "../lib/publicUser";
import { getEffectivePermissions } from "../lib/permissions";
import { DuplicateNameError } from "../lib/errors";
import { generateResetToken, hashResetToken } from "../lib/resetToken";

export const authRouter = Router();

const ALLOW_PUBLIC_REGISTRATION = process.env.ALLOW_PUBLIC_REGISTRATION !== "false";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

async function withPermissions(user: { id: number; name: string; email: string; role: any; createdAt?: Date }) {
  const permissions = await getEffectivePermissions(user.role);
  return { ...toPublicUser(user as any), permissions };
}

// POST /auth/login
authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    // Same error whether the email doesn't exist or the password is wrong.
    if (!user) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } });
    }

    const token = signToken({ id: user.id, role: user.role });
    res.json({ data: { token, user: await withPermissions(user) } });
  } catch (err) {
    next(err);
  }
});

// POST /auth/register — public signup. Always creates a STAFF account;
// role can never be set from the request body, so this can't be used to
// self-promote to Branch Manager or Master. Toggle off entirely with
// ALLOW_PUBLIC_REGISTRATION=false once you'd rather Master create every account.
authRouter.post("/register", async (req, res, next) => {
  try {
    if (!ALLOW_PUBLIC_REGISTRATION) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Public registration is turned off. Ask your Master account to create you an account." },
      });
    }

    const parsed = registerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }
    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new DuplicateNameError("An account with this email already exists.");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash, role: "STAFF" } });

    const token = signToken({ id: user.id, role: user.role });
    res.status(201).json({ data: { token, user: await withPermissions(user) } });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — restores a session on page reload from a stored token
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    res.json({ data: await withPermissions(user!) });
  } catch (err) {
    next(err);
  }
});

// PUT /auth/profile — update your own name/email
authRouter.put("/profile", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateProfileInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }
    const { name, email } = parsed.data;

    const duplicate = await prisma.user.findFirst({ where: { id: { not: req.user!.id }, email } });
    if (duplicate) throw new DuplicateNameError("An account with this email already exists.");

    const updated = await prisma.user.update({ where: { id: req.user!.id }, data: { name, email } });
    res.json({ data: await withPermissions(updated) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/change-password — for a logged-in user changing their own password
authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const parsed = changePasswordInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const valid = await bcrypt.compare(currentPassword, user!.passwordHash);
    if (!valid) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: { currentPassword: "Current password is incorrect." } },
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user!.id }, data: { passwordHash } });
    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

// POST /auth/forgot-password — public. Always returns the same generic
// message whether or not the email exists, so this can't be used to
// enumerate registered accounts.
authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const parsed = forgotPasswordInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }

    const genericResponse = { data: { message: "If an account exists for that email, a reset link has been sent." } };

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      // Don't reveal whether the email exists — same response either way.
      return res.json(genericResponse);
    }

    const { raw, hash } = generateResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    const resetLink = `${FRONTEND_URL}/?resetToken=${raw}`;

    // TODO: replace this with real email sending (e.g. nodemailer) once
    // you have an email provider configured. For now the link is printed
    // to the server console so you can test the flow end to end locally.
    console.log("──────────────────────────────────────────────");
    console.log(`Password reset requested for ${user.email}`);
    console.log(`Reset link (valid 1 hour): ${resetLink}`);
    console.log("──────────────────────────────────────────────");

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
});

// POST /auth/reset-password — consumes a token from the forgot-password email
authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const parsed = resetPasswordInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }

    const { token, newPassword } = parsed.data;
    const tokenHash = hashResetToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({
        error: { code: "INVALID_RESET_TOKEN", message: "This reset link is invalid or has expired. Request a new one." },
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
    ]);

    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

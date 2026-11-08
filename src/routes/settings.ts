import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";
import { zodErrorsToFields } from "../lib/zodErrors";

export const settingsRouter = Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `logo-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Logo must be an image file."));
    }
    cb(null, true);
  },
});

async function getOrCreateSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

// GET /settings — public (no auth) so the login screen can show branding
settingsRouter.get("/", async (_req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ data: settings });
  } catch (err) {
    next(err);
  }
});

const nameSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required.").max(80, "Company name must be under 80 characters."),
});

// PUT /settings — update company name
settingsRouter.put("/", requireAuth, requirePermission("settings.manage"), async (req, res, next) => {
  try {
    const parsed = nameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Some fields are invalid.", fields: zodErrorsToFields(parsed.error) },
      });
    }
    await getOrCreateSettings();
    const updated = await prisma.settings.update({ where: { id: 1 }, data: { companyName: parsed.data.companyName } });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /settings/logo — upload a new logo image
settingsRouter.post("/logo", requireAuth, requirePermission("settings.manage"), upload.single("logo"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "No image file was uploaded." } });
    }
    await getOrCreateSettings();
    const logoUrl = `/uploads/${req.file.filename}`;
    const updated = await prisma.settings.update({ where: { id: 1 }, data: { logoUrl } });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

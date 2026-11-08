import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { productInputSchema, VALID_UNITS } from "../validation/productSchema";
import { zodErrorsToFields } from "../lib/zodErrors";
import { NotFoundError, DuplicateNameError } from "../lib/errors";
import { requireAuth, requirePermission } from "../middleware/auth";

export const productsRouter = Router();

// Every route needs a logged-in user — viewing products is a baseline
// action (needed to build a bill), but mutations are gated further below.
productsRouter.use(requireAuth);

// GET /products/units — the fixed list of valid measuring types.
// Registered before "/:id" so Express doesn't treat "units" as an id.
productsRouter.get("/units", (_req, res) => {
  res.json({ data: VALID_UNITS });
});

// GET /products?q=mouse&page=1&limit=50
productsRouter.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { id: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ data: items, meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
});

// GET /products/:id
productsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!product) throw new NotFoundError("Product not found.");
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

// POST /products
productsRouter.post("/", requirePermission("products.create"), async (req, res, next) => {
  try {
    const parsed = productInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Some fields are invalid.",
          fields: zodErrorsToFields(parsed.error),
        },
      });
    }

    const { name, category, unit, price, qty } = parsed.data;

    const existing = await prisma.product.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, deletedAt: null },
    });
    if (existing) throw new DuplicateNameError();

    const product = await prisma.product.create({
      data: { name, category: category || "Uncategorized", unit: unit || "pcs", price, qty },
    });

    res.status(201).json({ data: product });
  } catch (err) {
    next(err);
  }
});

// PUT /products/:id
productsRouter.put("/:id", requirePermission("products.edit"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const parsed = productInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Some fields are invalid.",
          fields: zodErrorsToFields(parsed.error),
        },
      });
    }

    const current = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundError("Product not found.");

    const { name, category, unit, price, qty } = parsed.data;

    const duplicate = await prisma.product.findFirst({
      where: { id: { not: id }, name: { equals: name, mode: "insensitive" }, deletedAt: null },
    });
    if (duplicate) throw new DuplicateNameError();

    const updated = await prisma.product.update({
      where: { id },
      data: { name, category: category || "Uncategorized", unit: unit || "pcs", price, qty },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /products/:id  (soft delete — keeps past bills intact)
productsRouter.delete("/:id", requirePermission("products.delete"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundError("Product not found.");

    await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

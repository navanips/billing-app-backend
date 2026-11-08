import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { billInputSchema } from "../validation/billSchema";
import { zodErrorsToFields } from "../lib/zodErrors";
import { InsufficientStockError, NotFoundError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { hasPermission } from "../lib/permissions";

export const billsRouter = Router();

billsRouter.use(requireAuth);

// GET /bills?q=priya&page=1&limit=20
// Staff/managers without "billing.view_all" only see bills they created.
billsRouter.get("/", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));

    const canViewAll = await hasPermission(req.user!.role, "billing.view_all");

    const where: Prisma.BillWhereInput = {
      ...(canViewAll ? {} : { createdById: req.user!.id }),
      ...(q
        ? {
            OR: [
              { customerName: { contains: q, mode: "insensitive" } },
              { billNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        include: { items: true, createdBy: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bill.count({ where }),
    ]);

    res.json({ data: items, meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
});

// GET /bills/:id
billsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const bill = await prisma.bill.findUnique({
      where: { id },
      include: { items: true, createdBy: true },
    });
    if (!bill) throw new NotFoundError("Bill not found.");

    const canViewAll = await hasPermission(req.user!.role, "billing.view_all");
    if (!canViewAll && bill.createdById !== req.user!.id) {
      // Don't reveal that a bill with this id exists if it isn't theirs.
      throw new NotFoundError("Bill not found.");
    }

    res.json({ data: bill });
  } catch (err) {
    next(err);
  }
});

// POST /bills — creates a sale, decrements stock, all inside one transaction.
// Every logged-in role can create a bill (baseline action, not permission-gated).
billsRouter.post("/", async (req, res, next) => {
  try {
    const parsed = billInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Some fields are invalid.",
          fields: zodErrorsToFields(parsed.error),
        },
      });
    }

    const { customerName, items } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const productIds = items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const insufficient: { productId: number; requested: number; available: number }[] = [];
      for (const item of items) {
        const product = productMap.get(item.productId);
        if (!product || product.qty < item.qty) {
          insufficient.push({
            productId: item.productId,
            requested: item.qty,
            available: product ? product.qty : 0,
          });
        }
      }
      if (insufficient.length > 0) {
        throw new InsufficientStockError(insufficient);
      }

      let total = new Prisma.Decimal(0);
      const billItemsData = items.map((item) => {
        const product = productMap.get(item.productId)!;
        const amount = product.price.mul(item.qty);
        total = total.add(amount);
        return {
          productId: product.id,
          name: product.name,
          price: product.price,
          unit: product.unit,
          qty: item.qty,
          amount,
        };
      });

      // Create with a placeholder billNumber first, since it's derived
      // from the auto-generated id.
      const bill = await tx.bill.create({
        data: {
          customerName: customerName || "Walk-in Customer",
          total,
          createdById: req.user!.id,
          billNumber: "PENDING",
          items: { create: billItemsData },
        },
      });

      const billNumber = `B-${String(bill.id).padStart(4, "0")}`;

      const finalBill = await tx.bill.update({
        where: { id: bill.id },
        data: { billNumber },
        include: { items: true, createdBy: true },
      });

      for (const item of items) {
        const product = productMap.get(item.productId)!;
        await tx.product.update({
          where: { id: product.id },
          data: { qty: product.qty - item.qty },
        });
      }

      return finalBill;
    });

    res.status(201).json({ data: result });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return res.status(409).json({
        error: {
          code: "INSUFFICIENT_STOCK",
          message: err.message,
          items: err.items,
        },
      });
    }
    next(err);
  }
});

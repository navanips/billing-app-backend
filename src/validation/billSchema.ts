import { z } from "zod";

export const billInputSchema = z.object({
  customerName: z
    .string()
    .trim()
    .max(80, "Customer name must be under 80 characters.")
    .optional(),

  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        qty: z.coerce
          .number({ invalid_type_error: "Quantity must be a positive whole number." })
          .int("Quantity must be a positive whole number.")
          .positive("Quantity must be a positive whole number."),
      })
    )
    .min(1, "Add at least one item to the bill."),
});

export type BillInput = z.infer<typeof billInputSchema>;

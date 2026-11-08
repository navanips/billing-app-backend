import { z } from "zod";

// These rules intentionally mirror validateProductForm() in the frontend
// (BillingApp.jsx) so the same messages show up whether validation fails
// client-side or server-side.
export const VALID_UNITS = ["pcs", "kg", "g", "litre", "ml", "box", "dozen", "pack", "meter"];

export const productInputSchema = z.object({
  name: z
    .string({ required_error: "Product name is required." })
    .trim()
    .min(2, "Product name must be at least 2 characters.")
    .max(60, "Product name must be under 60 characters."),

  category: z
    .string()
    .trim()
    .max(40, "Category must be under 40 characters.")
    .optional(),

  unit: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || VALID_UNITS.includes(v), {
      message: `Unit must be one of: ${VALID_UNITS.join(", ")}.`,
    })
    .optional(),

  price: z.coerce
    .number({ invalid_type_error: "Price must be a number." })
    .gt(0, "Price must be greater than 0.")
    .max(10_000_000, "Price seems too high — check the value."),

  qty: z.coerce
    .number({ invalid_type_error: "Quantity must be a whole number, 0 or more." })
    .int("Quantity must be a whole number, 0 or more.")
    .min(0, "Quantity must be a whole number, 0 or more.")
    .max(1_000_000, "Quantity seems too high — check the value."),
});

export type ProductInput = z.infer<typeof productInputSchema>;

import { z } from "zod";

export const createUserInputSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60, "Name must be under 60 characters."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["MASTER", "BRANCH_MANAGER", "STAFF"], { invalid_type_error: "Role must be MASTER, BRANCH_MANAGER, or STAFF." }).default("STAFF"),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60, "Name must be under 60 characters."),
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(["MASTER", "BRANCH_MANAGER", "STAFF"], { invalid_type_error: "Role must be MASTER, BRANCH_MANAGER, or STAFF." }),
  // optional — leave blank to keep the existing password
  password: z.string().min(8, "Password must be at least 8 characters.").optional().or(z.literal("")),
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

import { ZodError } from "zod";

// Flattens a ZodError into a flat { fieldName: message } map so the
// response shape matches exactly what the frontend form already expects
// (see FieldError components in the Products/Billing pages).
export function zodErrorsToFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] ? String(issue.path[0]) : "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

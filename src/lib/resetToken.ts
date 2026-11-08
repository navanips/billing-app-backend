import crypto from "crypto";

// The raw token goes in the emailed link and is never stored. Only its
// hash is persisted, so a leaked database can't be used to forge resets.
export function generateResetToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashResetToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

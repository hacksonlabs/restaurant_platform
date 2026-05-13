import crypto from "node:crypto";

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}

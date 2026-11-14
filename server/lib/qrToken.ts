/**
 * QR Token utilities — hashed student identifiers for printable cards
 */
import { createHash, randomBytes } from "crypto";

/** Generate a unique hashed QR token for a student card */
export function generateQrToken(studentId: string): string {
  const salt = randomBytes(8).toString("hex");
  return createHash("sha256")
    .update(`${studentId}:${salt}:${Date.now()}`)
    .digest("hex")
    .slice(0, 32);
}

/** Verify a stored qrToken matches the student */
export function verifyQrToken(storedToken: string | null | undefined, providedToken: string): boolean {
  if (!storedToken || !providedToken) return false;
  return storedToken === providedToken;
}

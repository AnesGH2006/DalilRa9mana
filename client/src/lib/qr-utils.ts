/**
 * QR Code Utilities
 * 
 * Helpers for:
 *   - Generating printable QR codes for students
 *   - Verifying QR signatures
 *   - Managing QR tokens
 */

import { createHmac } from "crypto";

const SECRET = process.env.SESSION_SECRET ?? "school-qr-fallback-secret";

/**
 * Build QR payload with HMAC signature
 */
export interface QrPayload {
  sid: string;
  name: string;
  niveau: string;
  classe: string;
  annee: string;
  iat: number;
  sig: string;
}

export function buildQrPayload(student: {
  id: string;
  nomPrenom: string;
  niveau: string;
  classe: string;
  annee: string;
}): QrPayload {
  const raw: Omit<QrPayload, "sig"> = {
    sid: student.id,
    name: student.nomPrenom,
    niveau: student.niveau,
    classe: student.classe,
    annee: student.annee,
    iat: Math.floor(Date.now() / 1000),
  };

  const data = JSON.stringify(raw, Object.keys(raw).sort());
  const sig = createHmac("sha256", SECRET).update(data).digest("hex").slice(0, 16);

  return { ...raw, sig };
}

/**
 * Generate scannable QR URL
 * Result: https://example.com/scan-qr?sid=<id>&sig=<hmac>
 */
export function buildQrUrl(student: { id: string }, baseUrl: string): string {
  const sig = createHmac("sha256", SECRET).update(student.id).digest("hex").slice(0, 16);
  return `${baseUrl}/scan-qr?sid=${encodeURIComponent(student.id)}&sig=${encodeURIComponent(sig)}`;
}

/**
 * Verify QR signature
 */
export function verifyQrSignature(studentId: string, sig: string): boolean {
  const expected = createHmac("sha256", SECRET).update(studentId).digest("hex").slice(0, 16);
  return expected === sig;
}

/**
 * Check if QR is expired (older than X hours)
 */
export function isQrExpired(iat: number, maxAgeHours: number = 24): boolean {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - iat;
  const maxAgeSeconds = maxAgeHours * 60 * 60;
  return ageSeconds > maxAgeSeconds;
}

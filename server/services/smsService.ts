/**
 * SMS Service — Twilio + fallback gateway
 *
 * Priority:
 *   1. Twilio (TWILIO_ACCOUNT_SID + SMS_API_KEY as auth token + SMS_SENDER_ID as from)
 *   2. School-configured HTTP gateway (stored in school_info table)
 *
 * Arabic SMS note:
 *   Standard GSM-7 segment = 160 chars.
 *   Unicode (Arabic) segment = 70 chars.
 *   Multi-segment messages = 67 chars each segment (UDH overhead).
 */

import twilio from "twilio";
import { db, schoolInfoTable } from "../../shared/db.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ARABIC_SEGMENT_BYTES = 70;
export const ARABIC_MULTI_SEGMENT_BYTES = 67;

/** How many 70-char segments this message needs */
export function countSegments(message: string): number {
  const len = message.length;
  if (len <= ARABIC_SEGMENT_BYTES) return 1;
  return Math.ceil(len / ARABIC_MULTI_SEGMENT_BYTES);
}

/** True when Twilio env vars are all present */
export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.SMS_API_KEY &&
    process.env.SMS_SENDER_ID
  );
}

/**
 * Twilio needs international format (+213...). Parents usually write Algerian numbers
 * as 05XXXXXXXX / 06XXXXXXXX / 07XXXXXXXX, so convert those before sending.
 */
export function toInternationalDz(phone: string): string {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  if (/^213\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0\d{8,9}$/.test(cleaned)) return `+213${cleaned.slice(1)}`;
  return cleaned;
}

// ── Individual send ───────────────────────────────────────────────────────────

export interface SmsResult {
  phone: string;
  success: boolean;
  sid?: string;
  error?: string;
}

/** Send a single SMS via Twilio */
async function sendViaTwilio(to: string, message: string): Promise<SmsResult> {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.SMS_API_KEY!,
  );
  try {
    const msg = await client.messages.create({
      body: message,
      from: process.env.SMS_SENDER_ID!,
      to: toInternationalDz(to),
    });
    return { phone: to, success: true, sid: msg.sid };
  } catch (err: any) {
    return { phone: to, success: false, error: err?.message ?? "Twilio error" };
  }
}

/** Send via school's configured HTTP gateway */
async function sendViaGateway(
  to: string,
  message: string,
  gatewayUrl: string,
  apiKey?: string,
): Promise<SmsResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const body = JSON.stringify({ to, message, phone: to, text: message });
    const res = await fetch(gatewayUrl, { method: "POST", headers, body, signal: AbortSignal.timeout(15000) });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { phone: to, success: false, error: `Gateway ${res.status}: ${txt.slice(0, 120)}` };
    }
    return { phone: to, success: true };
  } catch (err: any) {
    return { phone: to, success: false, error: err?.message ?? "Gateway error" };
  }
}

// ── Bulk send ─────────────────────────────────────────────────────────────────

export interface BulkSmsOptions {
  phoneNumbers: string[];
  message: string;
  /** Resolved user ID — used to look up the school's gateway config */
  userId: string;
}

export interface BulkSmsResult {
  success: boolean;
  channel: "twilio" | "gateway" | "modem" | "socket" | "none";
  sent: number;
  failed: number;
  total: number;
  results: SmsResult[];
}

export async function sendBulkSms({
  phoneNumbers,
  message,
  userId,
}: BulkSmsOptions): Promise<BulkSmsResult> {
  const numbers = [...new Set(phoneNumbers.map(p => p.trim()).filter(Boolean))];
  if (!numbers.length) {
    return { success: false, channel: "none", sent: 0, failed: 0, total: 0, results: [] };
  }

  // ── 1. Try Twilio ─────────────────────────────────────────────────────────
  if (isTwilioConfigured()) {
    logger.info({ count: numbers.length }, "Sending SMS via Twilio");
    const settled = await Promise.allSettled(
      numbers.map(to => sendViaTwilio(to, message)),
    );
    const results = settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { phone: numbers[i]!, success: false, error: String((r as any).reason) },
    );
    const sent   = results.filter(r => r.success).length;
    const failed = results.length - sent;
    return { success: failed === 0, channel: "twilio", sent, failed, total: results.length, results };
  }

  // ── 2. Try school gateway ─────────────────────────────────────────────────
  const [school] = await db
    .select({ smsGatewayUrl: schoolInfoTable.smsGatewayUrl, smsGatewayApiKey: schoolInfoTable.smsGatewayApiKey })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.userId, userId))
    .limit(1);

  if (school?.smsGatewayUrl) {
    logger.info({ count: numbers.length }, "Sending SMS via school gateway");
    const settled = await Promise.allSettled(
      numbers.map(to => sendViaGateway(to, message, school.smsGatewayUrl!, school.smsGatewayApiKey ?? undefined)),
    );
    const results = settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { phone: numbers[i]!, success: false, error: String((r as any).reason) },
    );
    const sent   = results.filter(r => r.success).length;
    const failed = results.length - sent;
    return { success: failed === 0, channel: "gateway", sent, failed, total: results.length, results };
  }

  // ── 3. No channel configured ──────────────────────────────────────────────
  return {
    success: false,
    channel: "none",
    sent: 0,
    failed: numbers.length,
    total: numbers.length,
    results: numbers.map(phone => ({
      phone, success: false,
      error: "لم يتم تكوين أي بوابة SMS. أضف بيانات Twilio أو رابط البوابة في إعدادات المؤسسة.",
    })),
  };
}
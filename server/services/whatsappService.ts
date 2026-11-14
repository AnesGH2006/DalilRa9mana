import { db, schoolInfoTable } from "../../shared/db.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { toInternationalDz } from "./smsService.js";

export interface WhatsAppResult {
  phone: string;
  success: boolean;
  sid?: string;
  error?: string;
  channel: "whatsapp" | "sms" | "none";
}

export interface WhatsAppBulkResult {
  success: boolean;
  channel: "whatsapp" | "sms" | "none";
  sent: number;
  failed: number;
  total: number;
  results: WhatsAppResult[];
}

function toWhatsAppNumber(phone: string): string {
  return toInternationalDz(phone).replace(/\D/g, "");
}

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

function isWhatsAppGatewayConfigured(): boolean {
  return !!process.env.WHATSAPP_GATEWAY_URL;
}

async function sendViaMeta(phone: string, message: string): Promise<WhatsAppResult> {
  const to = toWhatsAppNumber(phone);
  if (!to) return { phone, success: false, error: "Invalid phone number", channel: "whatsapp" };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({})) as Record<string, any>;
    if (!res.ok) {
      return { phone, success: false, error: body?.error?.message ?? `WhatsApp ${res.status}`, channel: "whatsapp" };
    }
    return { phone, success: true, sid: body?.messages?.[0]?.id, channel: "whatsapp" };
  } catch (error: any) {
    return { phone, success: false, error: error?.message ?? "WhatsApp send failed", channel: "whatsapp" };
  }
}

async function sendViaGateway(phone: string, message: string): Promise<WhatsAppResult> {
  const url = process.env.WHATSAPP_GATEWAY_URL!;
  const key = process.env.WHATSAPP_GATEWAY_API_KEY ?? "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ to: phone, phone, message, text: message, channel: "whatsapp" }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({})) as Record<string, any>;
    if (!res.ok) {
      return { phone, success: false, error: body?.error ?? body?.message ?? `Gateway ${res.status}`, channel: "whatsapp" };
    }
    return { phone, success: true, sid: body?.id ?? body?.messageId ?? body?.sid, channel: "whatsapp" };
  } catch (error: any) {
    return { phone, success: false, error: error?.message ?? "WhatsApp gateway failed", channel: "whatsapp" };
  }
}

async function sendViaSmsFallback(phoneNumbers: string[], message: string, userId: string): Promise<WhatsAppBulkResult> {
  const { sendBulkSms } = await import("./smsService.js");
  const sms = await sendBulkSms({ phoneNumbers, message, userId });
  return {
    success: sms.success,
    channel: "sms",
    sent: sms.sent,
    failed: sms.failed,
    total: sms.total,
    results: sms.results.map(result => ({ ...result, channel: "sms" as const })),
  };
}

export async function sendWhatsAppBulk(input: {
  phoneNumbers: string[];
  message: string;
  userId: string;
}): Promise<WhatsAppBulkResult> {
  const numbers = [...new Set(input.phoneNumbers.map(phone => phone.trim()).filter(Boolean))];
  if (!numbers.length) {
    return { success: false, channel: "none", sent: 0, failed: 0, total: 0, results: [] };
  }

  if (isWhatsAppConfigured() || isWhatsAppGatewayConfigured()) {
    const settled = await Promise.allSettled(numbers.map(phone =>
      isWhatsAppConfigured() ? sendViaMeta(phone, input.message) : sendViaGateway(phone, input.message),
    ));
    const results = settled.map((item, index) =>
      item.status === "fulfilled"
        ? item.value
        : { phone: numbers[index]!, success: false, error: String((item as any).reason), channel: "whatsapp" as const },
    );
    const sent = results.filter(result => result.success).length;
    return { success: sent === results.length, channel: "whatsapp", sent, failed: results.length - sent, total: results.length, results };
  }

  logger.info({ count: numbers.length, userId: input.userId }, "WhatsApp not configured; falling back to SMS");
  return sendViaSmsFallback(numbers, input.message, input.userId);
}

export async function getWhatsAppStatus(userId: string): Promise<{
  whatsappConfigured: boolean;
  gatewayConfigured: boolean;
  channel: "whatsapp" | "sms" | "none";
}> {
  const whatsappConfigured = isWhatsAppConfigured() || isWhatsAppGatewayConfigured();
  if (whatsappConfigured) {
    return { whatsappConfigured: true, gatewayConfigured: isWhatsAppGatewayConfigured(), channel: "whatsapp" };
  }

  const [school] = await db.select({ smsGatewayUrl: schoolInfoTable.smsGatewayUrl })
    .from(schoolInfoTable)
    .where(eq(schoolInfoTable.userId, userId))
    .limit(1);
  const smsConfigured = !!process.env.TWILIO_ACCOUNT_SID || !!process.env.SMS_GATEWAY_URL || !!school?.smsGatewayUrl;
  return { whatsappConfigured: false, gatewayConfigured: false, channel: smsConfigured ? "sms" : "none" };
}

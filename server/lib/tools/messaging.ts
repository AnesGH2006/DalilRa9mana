/**
 * messaging_dispatcher_tool — sends alerts via Email, WhatsApp, or internal notifications.
 * Email uses nodemailer (SMTP_* env vars). WhatsApp triggers a configured webhook.
 * Internal notifications are stored in DB for the dashboard.
 */
import nodemailer from "nodemailer";
import { db, notificationsTable } from "../../../shared/db.js";
import { randomUUID } from "crypto";
import { sendPushToUser } from "../../services/pushNotificationService.js";
import { SCHOOL_STAGE } from "../../config/school-stage.js";

const schoolTypeLabel = SCHOOL_STAGE === "lycee" ? "الثانوية" : "المتوسطة";

export interface MessagingInput {
  channel: "email" | "whatsapp" | "dashboard" | "all";
  recipient?: string;          // Email address or phone number
  subject: string;
  message: string;
  priority?: "low" | "normal" | "urgent";
  metadata?: Record<string, unknown>;
}

async function sendEmail(input: MessagingInput): Promise<{ sent: boolean; info?: string; error?: string }> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");

  if (!smtpHost || !smtpUser || !smtpPass) {
    return {
      sent: false,
      info: "خدمة البريد الإلكتروني غير مُهيّأة. يرجى إضافة متغيرات SMTP_HOST و SMTP_USER و SMTP_PASS في إعدادات البيئة.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  try {
    const result = await transporter.sendMail({
      from: `"نظام مدير ${schoolTypeLabel}" <${smtpUser}>`,
      to: input.recipient,
      subject: input.subject,
      text: input.message,
      html: `<div dir="rtl" style="font-family:Arial;font-size:14px;line-height:1.8">${input.message.replace(/\n/g, "<br>")}</div>`,
    });
    return { sent: true, info: `تم الإرسال بنجاح إلى ${input.recipient} (ID: ${result.messageId})` };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

async function sendWhatsApp(input: MessagingInput): Promise<{ sent: boolean; info?: string; error?: string }> {
  const webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      sent: false,
      info: "خدمة واتساب غير مُهيّأة. يرجى إضافة WHATSAPP_WEBHOOK_URL في إعدادات البيئة (n8n أو Make).",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: input.recipient,
        message: `*${input.subject}*\n\n${input.message}`,
        priority: input.priority ?? "normal",
      }),
    });
    if (!response.ok) {
      return { sent: false, error: `Webhook responded with ${response.status}` };
    }
    return { sent: true, info: `تم إرسال رسالة واتساب إلى ${input.recipient}` };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

async function storeNotification(input: MessagingInput, userId: string): Promise<{ stored: boolean; id: string }> {
  const id = randomUUID();
  await db.insert(notificationsTable).values({
    id,
    userId,
    title: input.subject,
    body: input.message,
    type: input.priority === "urgent" ? "warning" : "info",
    metadata: input.metadata ?? {},
  });
  await sendPushToUser(userId, {
    title: input.subject,
    body: input.message,
    type: input.priority === "urgent" ? "warning" : "general",
  });
  return { stored: true, id };
}

export async function messagingDispatcherTool(input: MessagingInput, userId: string): Promise<unknown> {
  const results: Record<string, unknown> = {};

  const channels = input.channel === "all"
    ? ["email", "whatsapp", "dashboard"] as const
    : [input.channel] as const;

  await Promise.all(channels.map(async (ch) => {
    if (ch === "email") {
      results.email = await sendEmail(input);
    } else if (ch === "whatsapp") {
      results.whatsapp = await sendWhatsApp(input);
    } else if (ch === "dashboard") {
      results.dashboard = await storeNotification(input, userId);
    }
  }));

  return {
    success: true,
    channels_attempted: channels,
    results,
    summary: `تم معالجة طلب الإرسال عبر: ${channels.join("، ")}`,
  };
}

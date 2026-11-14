import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "../../shared/db.js";
import { logger } from "../lib/logger.js";

let vapidConfigured = false;

export function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    // Without this log, a missing env var fails completely silently.
    logger.error(
      {
        hasSubject: !!subject,
        hasPublicKey: !!publicKey,
        hasPrivateKey: !!privateKey,
      },
      "VAPID is not configured — push notifications are disabled"
    );
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

// Lets a route safely expose the public key to the browser.
export function getVapidPublicKey(): string | null {
  if (!configureVapid()) return null;
  return process.env.VAPID_PUBLIC_KEY!;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  type?: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!configureVapid()) return 0;

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  const expired: string[] = [];
  let sent = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload));
      sent += 1;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        expired.push(subscription.id);
      } else {
        logger.error({ error, subscriptionId: subscription.id }, "Push send failed");
      }
    }
  }));

  if (expired.length > 0) {
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, expired));
  }

  return sent;
}
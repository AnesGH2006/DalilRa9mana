import { db, notificationsTable } from "../../shared/db.js";
import { logger } from "../lib/logger.js";
import { sendPushToUser } from "./pushNotificationService.js";

export async function notifyParentAccount(input: {
  userId: string;
  title: string;
  body: string;
  type: string;
  url?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ notificationId: string; pushSent: number }> {
  const [notification] = await db.insert(notificationsTable).values({
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: input.type,
    metadata: input.metadata ?? {},
  }).returning({ id: notificationsTable.id });

  let pushSent = 0;
  try {
    pushSent = await sendPushToUser(input.userId, {
      title: input.title,
      body: input.body,
      url: input.url,
      type: input.type,
    });
    if (pushSent === 0) {
      logger.warn(
        { userId: input.userId, notificationId: notification!.id },
        "Push NOT delivered: this parent has no saved push subscription, or every send failed",
      );
    } else {
      logger.info(
        { userId: input.userId, notificationId: notification!.id, pushSent },
        "Push delivered to push service",
      );
    }
  } catch (error) {
    logger.error({ error, userId: input.userId, notificationId: notification!.id }, "Parent push notification failed");
  }

  return { notificationId: notification!.id, pushSent };
}
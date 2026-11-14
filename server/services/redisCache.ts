import IORedis from "ioredis";
import { logger } from "../lib/logger.js";

let client: IORedis | undefined;

function getClient(): IORedis | undefined {
  const url = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_URL;
  if (!url) return undefined;
  if (!client) {
    client = new IORedis(url, { maxRetriesPerRequest: 2, enableReadyCheck: false });
    client.on("error", (error) => logger.warn({ error }, "Redis cache error"));
  }
  return client;
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) as T : null;
  } catch (error) {
    logger.warn({ error, key }, "Redis cache read failed");
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSeconds = 600): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    logger.warn({ error, key }, "Redis cache write failed");
  }
}

export async function deleteCachedJson(key: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    logger.warn({ error, key }, "Redis cache deletion failed");
  }
}

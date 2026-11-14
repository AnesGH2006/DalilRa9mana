import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { logger } from "../lib/logger.js";
import { notifyParentOfAbsence } from "./absenceAlerts.js";

const QUEUE_NAME = "parent-notifications";
let connection: IORedis | undefined;
let queue: Queue | undefined;
let worker: Worker | undefined;

function redisUrl(): string | undefined {
  return process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_URL;
}

function getConnection(): IORedis {
  if (!connection) {
    const url = redisUrl();
    if (!url) throw new Error("Redis is not configured");
    connection = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
    connection.on("error", (error) => logger.error({ error }, "Redis connection error"));
  }
  return connection;
}

export function startNotificationWorker(): void {
  if (!redisUrl() || worker) return;
  worker = new Worker(QUEUE_NAME, async (job: Job) => {
    if (job.name === "absence") await notifyParentOfAbsence(job.data);
  }, { connection: getConnection(), concurrency: 20 });
  worker.on("failed", (job, error) => logger.error({ jobId: job?.id, error }, "Notification job failed"));
  logger.info("Parent notification worker started");
}

export async function enqueueAbsenceAlert(input: {
  schoolUserId: string;
  studentId: string;
  annee: string;
  date?: string;
}): Promise<boolean> {
  if (!redisUrl()) return false;
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: getConnection(), defaultJobOptions: { attempts: 4, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
  await queue.add("absence", input, { jobId: `absence:${input.schoolUserId}:${input.studentId}:${input.annee}:${input.date ?? new Date().toISOString().slice(0, 10)}` });
  return true;
}

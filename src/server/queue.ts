import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/server/env";

declare global {
  // eslint-disable-next-line no-var
  var __redis: IORedis | undefined;
  // eslint-disable-next-line no-var
  var __syncQueue: Queue | undefined;
}

export function getRedis() {
  if (global.__redis) return global.__redis;
  const redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  global.__redis = redis;
  return redis;
}

export function getSyncQueue() {
  if (global.__syncQueue) return global.__syncQueue;
  const q = new Queue("sync", { connection: getRedis() });
  global.__syncQueue = q;
  return q;
}

export async function enqueueFullSync(siteId: string) {
  const q = getSyncQueue();
  await q.add(
    "sync",
    { siteId, type: "FULL" as const },
    { removeOnComplete: 100, removeOnFail: 100 },
  );
}

export async function enqueuePollSync(siteId: string) {
  const q = getSyncQueue();
  await q.add(
    "sync",
    { siteId, type: "POLL" as const },
    { jobId: `poll:${siteId}`, removeOnComplete: 10, removeOnFail: 10 },
  );
}


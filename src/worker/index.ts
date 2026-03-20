import { Worker } from "bullmq";
import { prisma } from "@/server/db";
import { getRedis, getSyncQueue, enqueuePollSync } from "@/server/queue";
import { runFullSync, runPollSync } from "@/server/sync/sync";
import { env } from "@/server/env";
import { startFeishuLongConnection } from "@/server/feishu/longconn";

type SyncJobData = { siteId: string; type: "FULL" | "POLL" };

async function start() {
  // Ensure Redis connection is established early.
  getRedis();
  getSyncQueue();

  const worker = new Worker<SyncJobData>(
    "sync",
    async (job) => {
      const { siteId, type } = job.data;
      if (type === "FULL") await runFullSync(siteId);
      else if (type === "POLL") await runPollSync(siteId);
      else throw new Error(`Unknown sync type: ${String(type)}`);
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error("[worker] job failed", job?.id, err);
  });

  if (env.FEISHU_EVENT_SUBSCRIBE_MODE === "longconn") {
    await startFeishuLongConnection();
  }

  // Poll loop every 5 minutes.
  setInterval(async () => {
    const bindings = await prisma.spaceBinding.findMany({
      where: { syncEnabled: true },
      select: { siteId: true },
    });
    for (const b of bindings) {
      try {
        await enqueuePollSync(b.siteId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[worker] enqueue poll failed", e);
      }
    }
  }, 5 * 60 * 1000);

  // eslint-disable-next-line no-console
  console.log("[worker] sync worker started");
}

start().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[worker] fatal", e);
  process.exit(1);
});

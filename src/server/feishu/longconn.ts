import * as lark from "@larksuiteoapi/node-sdk";
import { env } from "@/server/env";
import { getOrCreateDefaultSite } from "@/server/site";
import { enqueuePollSync } from "@/server/queue";

const lastQueuedAtBySite = new Map<string, number>();
let started = false;
let wsClientRef: lark.WSClient | null = null;

async function enqueuePollSyncWithDebounce(siteId: string): Promise<boolean> {
  const now = Date.now();
  const last = lastQueuedAtBySite.get(siteId) ?? 0;
  if (now - last < env.FEISHU_LONGCONN_DEBOUNCE_MS) return false;
  lastQueuedAtBySite.set(siteId, now);
  await enqueuePollSync(siteId);
  return true;
}

export async function startFeishuLongConnection(): Promise<void> {
  if (started && wsClientRef) return;
  if (started) return;
  if (env.FEISHU_EVENT_SUBSCRIBE_MODE !== "longconn") return;
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    // eslint-disable-next-line no-console
    console.warn("[longconn] skipped: FEISHU_APP_ID / FEISHU_APP_SECRET is missing");
    return;
  }

  const eventDispatcher = new lark.EventDispatcher({}).register({
    "drive.file.edit_v1": async (payload: unknown) => {
      try {
        const site = await getOrCreateDefaultSite();
        const queued = await enqueuePollSyncWithDebounce(site.id);
        // eslint-disable-next-line no-console
        console.log(
          `[longconn] drive.file.edit_v1 received, site=${site.id}, queued=${String(queued)}`,
          payload,
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[longconn] handle drive.file.edit_v1 failed", e);
      }
    },
  });

  const wsClient = new lark.WSClient({
    appId: env.FEISHU_APP_ID,
    appSecret: env.FEISHU_APP_SECRET,
    loggerLevel: lark.LoggerLevel.info,
  });

  wsClientRef = wsClient;
  void wsClient.start({ eventDispatcher }).catch((e: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[longconn] start failed", e);
    started = false;
    wsClientRef = null;
  });
  started = true;
  // eslint-disable-next-line no-console
  console.log("[longconn] starting", { connected: Boolean(wsClientRef) });
}

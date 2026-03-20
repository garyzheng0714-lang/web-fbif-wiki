import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { getValidUserAccessToken } from "@/server/feishu/tokenStore";
import { fetchAllDocxBlocks, listWikiNodes } from "@/server/feishu/client";
import { renderDocxBlocksToHtml } from "@/server/docx/render";
import { makePageSlug } from "@/server/slug";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function ensureUniquePageSlug(siteId: string, desired: string): Promise<string> {
  const base = desired || "page";
  let slug = base;
  for (let i = 0; i < 50; i++) {
    const exists = await prisma.page.findUnique({ where: { siteId_slug: { siteId, slug } } });
    if (!exists) return slug;
    slug = `${base}-${i + 2}`;
  }
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function parseEditTimeMs(v?: string): bigint | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Feishu returns ms timestamp as string.
  return BigInt(Math.trunc(n));
}

export async function runFullSync(siteId: string): Promise<void> {
  const site = await prisma.site.findUnique({ where: { id: siteId }, include: { binding: true } });
  if (!site) throw new Error("Site not found");
  if (!site.binding) throw new Error("Site not bound to a Wiki space");

  const binding = site.binding;
  const job = await prisma.syncJob.create({
    data: { siteId, type: "FULL", status: "RUNNING", startedAt: new Date() },
  });

  try {
    const { accessToken } = await getValidUserAccessToken(binding.boundByUserId);

    const q: Array<{ parent?: string }> = [{ parent: binding.rootNodeToken ?? undefined }];
    const visitedParents = new Set<string>();

    while (q.length > 0) {
      const { parent } = q.shift()!;
      const key = parent ?? "__root__";
      if (visitedParents.has(key)) continue;
      visitedParents.add(key);

      const items = await listWikiNodes(accessToken, binding.spaceId, parent);
      for (const n of items) {
        const objEditTimeMs = parseEditTimeMs(n.obj_edit_time);

        await prisma.wikiNode.upsert({
          where: { siteId_nodeToken: { siteId, nodeToken: n.node_token } },
          create: {
            siteId,
            nodeToken: n.node_token,
            parentNodeToken: n.parent_node_token ?? parent ?? null,
            title: n.title,
            objType: n.obj_type,
            objToken: n.obj_token,
            objEditTimeMs,
          },
          update: {
            parentNodeToken: n.parent_node_token ?? parent ?? null,
            title: n.title,
            objType: n.obj_type,
            objToken: n.obj_token,
            objEditTimeMs,
          },
        });

        const existingPage = await prisma.page.findUnique({
          where: { siteId_nodeToken: { siteId, nodeToken: n.node_token } },
        });
        if (!existingPage) {
          const desired = makePageSlug(n.title, n.node_token);
          const slug = await ensureUniquePageSlug(siteId, desired);
          await prisma.page.create({
            data: {
              siteId,
              nodeToken: n.node_token,
              title: n.title,
              slug,
              status: "DRAFT",
              navVisible: true,
            },
          });
        } else if (existingPage.title !== n.title) {
          await prisma.page.update({
            where: { id: existingPage.id },
            data: { title: n.title },
          });
        }

        if (n.has_child) q.push({ parent: n.node_token });
      }
    }

    await prisma.spaceBinding.update({
      where: { id: binding.id },
      data: { lastFullSyncAt: new Date() },
    });

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });
  } catch (e: unknown) {
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: errorMessage(e) },
    });
    throw e;
  }
}

export async function runPollSync(siteId: string): Promise<void> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { binding: true },
  });
  if (!site) throw new Error("Site not found");
  if (!site.binding) return;

  const binding = site.binding;
  const job = await prisma.syncJob.create({
    data: { siteId, type: "POLL", status: "RUNNING", startedAt: new Date() },
  });

  try {
    const { accessToken } = await getValidUserAccessToken(binding.boundByUserId);

    const changedNodeTokens = new Set<string>();
    const q: Array<{ parent?: string }> = [{ parent: binding.rootNodeToken ?? undefined }];
    const visitedParents = new Set<string>();

    while (q.length > 0) {
      const { parent } = q.shift()!;
      const key = parent ?? "__root__";
      if (visitedParents.has(key)) continue;
      visitedParents.add(key);

      const items = await listWikiNodes(accessToken, binding.spaceId, parent);
      for (const n of items) {
        const objEditTimeMs = parseEditTimeMs(n.obj_edit_time);
        const existing = await prisma.wikiNode.findUnique({
          where: { siteId_nodeToken: { siteId, nodeToken: n.node_token } },
        });

        const isChanged =
          !existing ||
          existing.objToken !== n.obj_token ||
          existing.objType !== n.obj_type ||
          (objEditTimeMs !== null && existing.objEditTimeMs !== objEditTimeMs);

        await prisma.wikiNode.upsert({
          where: { siteId_nodeToken: { siteId, nodeToken: n.node_token } },
          create: {
            siteId,
            nodeToken: n.node_token,
            parentNodeToken: n.parent_node_token ?? parent ?? null,
            title: n.title,
            objType: n.obj_type,
            objToken: n.obj_token,
            objEditTimeMs,
          },
          update: {
            parentNodeToken: n.parent_node_token ?? parent ?? null,
            title: n.title,
            objType: n.obj_type,
            objToken: n.obj_token,
            objEditTimeMs,
          },
        });

        if (isChanged) changedNodeTokens.add(n.node_token);
        if (n.has_child) q.push({ parent: n.node_token });
      }
    }

    // Refresh published pages that changed.
    const publishedPages = await prisma.page.findMany({
      where: { siteId, status: "PUBLISHED" },
    });
    for (const p of publishedPages) {
      if (!changedNodeTokens.has(p.nodeToken)) continue;
      await refreshPageRevision(p.id, accessToken);
    }

    await prisma.spaceBinding.update({
      where: { id: binding.id },
      data: { lastPollSyncAt: new Date() },
    });

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", finishedAt: new Date() },
    });
  } catch (e: unknown) {
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: errorMessage(e) },
    });
    throw e;
  }
}

export async function refreshPageRevision(pageId: string, userAccessToken?: string): Promise<void> {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) throw new Error("Page not found");

  const node = await prisma.wikiNode.findUnique({
    where: { siteId_nodeToken: { siteId: page.siteId, nodeToken: page.nodeToken } },
  });
  if (!node) throw new Error("Wiki node not found for page");

  let accessToken = userAccessToken;
  if (!accessToken) {
    const binding = await prisma.spaceBinding.findUnique({
      where: { siteId: page.siteId },
      select: { boundByUserId: true },
    });
    if (!binding) throw new Error("Site binding not found");
    accessToken = (await getValidUserAccessToken(binding.boundByUserId)).accessToken;
  }

  const latest = await prisma.pageRevision.findFirst({
    where: { pageId: page.id },
    orderBy: { createdAt: "desc" },
  });

  // Only docx rendering in MVP.
  let html = "";
  let toc: Array<{ id: string; level: number; text: string }> = [];
  let hash = "";
  if (node.objType !== "docx") {
    html = `<div class="fbif-unsupported">[暂不支持的文档类型：${node.objType}]</div>`;
    toc = [];
    hash = crypto.createHash("sha256").update(html).digest("hex");
  } else {
    const blocks = await fetchAllDocxBlocks(accessToken, node.objToken);
    const rendered = renderDocxBlocksToHtml(blocks);
    html = rendered.html;
    toc = rendered.toc;
    hash = rendered.hash;
  }

  if (latest && latest.hash === hash) return;

  await prisma.pageRevision.create({
    data: {
      pageId: page.id,
      sourceObjType: node.objType,
      sourceObjToken: node.objToken,
      sourceEditTimeMs: node.objEditTimeMs ?? null,
      hash,
      html,
      tocJson: toc,
    },
  });
}

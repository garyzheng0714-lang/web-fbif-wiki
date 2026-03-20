import { NextRequest } from "next/server";
import { requireAdminUserFromRequest } from "@/server/auth";
import { badRequest, ok, serverError } from "@/server/http";
import { getOrCreateDefaultSite } from "@/server/site";
import { prisma } from "@/server/db";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdminUserFromRequest(req);
    if (!user) return badRequest("Unauthorized", 401);
    const site = await getOrCreateDefaultSite();

    const pages = await prisma.page.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      include: {
        revisions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return ok({
      items: pages.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        navVisible: p.navVisible,
        sort: p.sort,
        updatedAt: p.updatedAt,
        latestRevisionAt: p.revisions[0]?.createdAt ?? null,
      })),
    });
  } catch (e) {
    return serverError(e);
  }
}


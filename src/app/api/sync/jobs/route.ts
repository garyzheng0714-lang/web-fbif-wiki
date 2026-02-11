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

    const jobs = await prisma.syncJob.findMany({
      where: { siteId: site.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok({ items: jobs });
  } catch (e) {
    return serverError(e);
  }
}


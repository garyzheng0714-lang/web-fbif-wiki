import { NextRequest } from "next/server";
import { requireAdminUserFromRequest } from "@/server/auth";
import { badRequest, ok, serverError } from "@/server/http";
import { getOrCreateDefaultSite } from "@/server/site";
import { enqueuePollSync } from "@/server/queue";
import { prisma } from "@/server/db";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminUserFromRequest(req);
    if (!user) return badRequest("Unauthorized", 401);
    if (user.role === "VIEWER") return badRequest("Forbidden", 403);

    const site = await getOrCreateDefaultSite();
    const binding = await prisma.spaceBinding.findUnique({ where: { siteId: site.id } });
    if (!binding) return badRequest("Site not bound to a space", 400);

    await enqueuePollSync(site.id);
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "trigger_sync",
        targetType: "site",
        targetId: site.id,
      },
    });
    return ok({ queued: true });
  } catch (e) {
    return serverError(e);
  }
}


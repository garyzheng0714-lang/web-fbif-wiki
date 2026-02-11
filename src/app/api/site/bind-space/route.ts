import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminUserFromRequest } from "@/server/auth";
import { badRequest, ok, serverError } from "@/server/http";
import { getOrCreateDefaultSite } from "@/server/site";
import { prisma } from "@/server/db";
import { enqueueFullSync } from "@/server/queue";

const schema = z.object({
  spaceId: z.string().min(1),
  rootNodeToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminUserFromRequest(req);
    if (!user) return badRequest("Unauthorized", 401);
    if (user.role === "VIEWER") return badRequest("Forbidden", 403);

    const body = schema.parse(await req.json());
    const site = await getOrCreateDefaultSite();

    const binding = await prisma.spaceBinding.upsert({
      where: { siteId: site.id },
      create: {
        siteId: site.id,
        spaceId: body.spaceId,
        boundByUserId: user.id,
        rootNodeToken: body.rootNodeToken,
        syncEnabled: true,
      },
      update: {
        spaceId: body.spaceId,
        boundByUserId: user.id,
        rootNodeToken: body.rootNodeToken,
        syncEnabled: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "bind_space",
        targetType: "site",
        targetId: site.id,
        metaJson: { spaceId: body.spaceId, rootNodeToken: body.rootNodeToken ?? null },
      },
    });

    await enqueueFullSync(site.id);

    return ok({ binding });
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      return badRequest("Invalid body");
    }
    return serverError(e);
  }
}

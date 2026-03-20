import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminUserFromRequest } from "@/server/auth";
import { badRequest, ok, serverError } from "@/server/http";
import { getOrCreateDefaultSite } from "@/server/site";
import { prisma } from "@/server/db";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: z.string().min(1).max(80).optional(),
  theme: z.string().min(1).max(32).optional(),
  homePageSlug: z.string().min(1).max(80).nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdminUserFromRequest(req);
    if (!user) return badRequest("Unauthorized", 401);

    const site = await getOrCreateDefaultSite();
    const binding = await prisma.spaceBinding.findUnique({
      where: { siteId: site.id },
    });
    const stats = await prisma.page.groupBy({
      by: ["status"],
      where: { siteId: site.id },
      _count: true,
    });
    return ok({
      site,
      binding,
      stats: {
        published: stats.find((s) => s.status === "PUBLISHED")?._count ?? 0,
        draft: stats.find((s) => s.status === "DRAFT")?._count ?? 0,
      },
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAdminUserFromRequest(req);
    if (!user) return badRequest("Unauthorized", 401);
    if (user.role === "VIEWER") return badRequest("Forbidden", 403);

    const body = patchSchema.parse(await req.json());
    const site = await getOrCreateDefaultSite();
    const updated = await prisma.site.update({
      where: { id: site.id },
      data: {
        name: body.name ?? undefined,
        slug: body.slug ?? undefined,
        theme: body.theme ?? undefined,
        homePageSlug:
          body.homePageSlug === undefined
            ? undefined
            : body.homePageSlug,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "update_site",
        targetType: "site",
        targetId: updated.id,
        metaJson: body,
      },
    });
    return ok({ site: updated });
  } catch (e: unknown) {
    if (e instanceof ZodError) return badRequest("Invalid body");
    return serverError(e);
  }
}

import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminUserFromRequest } from "@/server/auth";
import { badRequest, ok, serverError } from "@/server/http";
import { prisma } from "@/server/db";
import { refreshPageRevision } from "@/server/sync/sync";

const schema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
  navVisible: z.boolean().optional(),
  sort: z.number().int().optional(),
  slug: z.string().min(1).max(80).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { pageId: string } },
) {
  try {
    const user = await requireAdminUserFromRequest(req);
    if (!user) return badRequest("Unauthorized", 401);
    if (user.role === "VIEWER") return badRequest("Forbidden", 403);

    const body = schema.parse(await req.json());
    const page = await prisma.page.findUnique({ where: { id: params.pageId } });
    if (!page) return badRequest("Page not found", 404);

    const updated = await prisma.page.update({
      where: { id: page.id },
      data: {
        status: body.status ?? undefined,
        navVisible: body.navVisible ?? undefined,
        sort: body.sort ?? undefined,
        slug: body.slug ?? undefined,
      },
    });

    // On publish, immediately build latest revision if needed.
    if (body.status === "PUBLISHED") {
      await refreshPageRevision(updated.id);
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "update_page",
        targetType: "page",
        targetId: updated.id,
        metaJson: body,
      },
    });

    return ok({ page: updated });
  } catch (e: unknown) {
    if (e instanceof ZodError) return badRequest("Invalid body");
    return serverError(e);
  }
}

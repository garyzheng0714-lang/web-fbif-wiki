import { NextRequest } from "next/server";
import { requireAdminUserFromRequest } from "@/server/auth";
import { ok, badRequest } from "@/server/http";

export async function GET(req: NextRequest) {
  const user = await requireAdminUserFromRequest(req);
  if (!user) return badRequest("Unauthorized", 401);
  return ok({
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    tenantKey: user.tenantKey,
  });
}


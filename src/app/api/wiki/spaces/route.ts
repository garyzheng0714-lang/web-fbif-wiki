import { NextRequest } from "next/server";
import { requireAdminUserFromRequest } from "@/server/auth";
import { badRequest, ok, serverError } from "@/server/http";
import { getValidUserAccessToken } from "@/server/feishu/tokenStore";
import { listAllWikiSpaces } from "@/server/feishu/client";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAdminUserFromRequest(req);
    if (!user) return badRequest("Unauthorized", 401);

    const { accessToken } = await getValidUserAccessToken(user.id);
    const spaces = await listAllWikiSpaces(accessToken);
    return ok({ items: spaces });
  } catch (e) {
    return serverError(e);
  }
}


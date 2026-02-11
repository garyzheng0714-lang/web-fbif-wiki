import type { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { getSessionFromRequest, getSessionFromServerCookies } from "@/server/session";

export async function requireAdminUserFromRequest(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return null;
  const user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  return user ?? null;
}

export async function requireAdminUserFromServerCookies() {
  const session = await getSessionFromServerCookies();
  if (!session) return null;
  const user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  return user ?? null;
}


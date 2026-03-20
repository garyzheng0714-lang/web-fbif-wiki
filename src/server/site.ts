import { prisma } from "@/server/db";

export async function getOrCreateDefaultSite() {
  const existing = await prisma.site.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return await prisma.site.create({
    data: {
      slug: "default",
      name: "飞书发布站",
      theme: "clean",
    },
  });
}


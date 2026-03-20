import type { MetadataRoute } from "next";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await prisma.site.findFirst({ orderBy: { createdAt: "asc" } });
  if (!site) return [];

  const pages = await prisma.page.findMany({
    where: { siteId: site.id, status: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
  });
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return pages.map((p) => ({
    url: `${base}/s/${site.slug}/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "hourly",
    priority: 0.7,
  }));
}

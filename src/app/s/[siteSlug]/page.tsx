import { redirect, notFound } from "next/navigation";
import { prisma } from "@/server/db";

export default async function SiteIndex({
  params,
}: {
  params: { siteSlug: string };
}) {
  const site = await prisma.site.findUnique({ where: { slug: params.siteSlug } });
  if (!site) notFound();

  const targetSlug =
    site.homePageSlug ??
    (
      await prisma.page.findFirst({
        where: { siteId: site.id, status: "PUBLISHED" },
        orderBy: [{ sort: "asc" }, { updatedAt: "desc" }],
      })
    )?.slug;

  if (!targetSlug) {
    return (
      <main className="min-h-screen bg-slate-50 p-10">
        <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">{site.name}</h1>
          <p className="mt-3 text-slate-600">该站点还没有已发布页面。</p>
        </div>
      </main>
    );
  }
  redirect(`/s/${site.slug}/${targetSlug}`);
}


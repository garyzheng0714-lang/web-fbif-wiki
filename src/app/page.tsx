import Link from "next/link";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const firstPublished = await prisma.page.findFirst({
    where: { status: "PUBLISHED" },
    include: { site: true },
    orderBy: { updatedAt: "desc" },
  });

  const previewPath = firstPublished
    ? `/s/${firstPublished.site.slug}/${firstPublished.slug}`
    : "/admin";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-[0.18em] text-blue-300">Feishu Wiki Publisher</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-6xl">飞书云文档发布站</h1>
          <p className="mt-5 max-w-3xl text-base text-slate-300 md:text-lg">
            将飞书知识库同步到可公开访问的网站，提供页面发布管理、自动巡检同步和文档渲染。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
            >
              打开管理台
            </Link>
            <Link
              href={previewPath}
              className="rounded-xl border border-slate-500 px-5 py-3 text-sm font-medium text-white transition hover:border-slate-300"
            >
              访问发布站点
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

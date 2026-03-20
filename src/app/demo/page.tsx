import Link from "next/link";

export const dynamic = "force-static";

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-8 shadow-2xl md:p-12">
          <p className="text-sm uppercase tracking-[0.18em] text-blue-300">FBIF Wiki</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
            页面已可访问
          </h1>
          <p className="mt-5 text-base text-slate-300">
            这是一个无需数据库的在线演示页，用于确认站点访问正常。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
            >
              打开管理台
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-slate-500 px-5 py-3 text-sm font-medium text-white transition hover:border-slate-300"
            >
              返回首页
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}


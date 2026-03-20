import Link from "next/link";
import { requireAdminUserFromServerCookies } from "@/server/auth";
import { prisma } from "@/server/db";
import { getOrCreateDefaultSite } from "@/server/site";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { env } from "@/server/env";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireAdminUserFromServerCookies();
  if (!user) {
    const error = typeof searchParams.error === "string" ? searchParams.error : "";
    const missingConfig = !env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET;
    const usingPlaceholder =
      env.FEISHU_APP_ID.startsWith("dev-") || env.FEISHU_APP_SECRET.startsWith("dev-");
    return (
      <main className="min-h-screen bg-slate-100 p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">飞书发布站管理台</h1>
          <p className="mt-3 text-slate-600">
            登录后可绑定知识库、同步文档并发布为公开网站页面。
          </p>
          {error ? (
            <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
              登录失败：{error}
            </p>
          ) : null}
          {missingConfig || usingPlaceholder ? (
            <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              检测到飞书配置缺失或仍是占位值。请先设置真实的 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`，再重试登录。
              <div className="mt-1">
                可用 <code>/api/auth/feishu/check</code> 快速验证凭证是否可用。
              </div>
            </div>
          ) : null}
          <div className="mt-8">
            <Link
              href="/api/auth/feishu/start"
              className="inline-flex items-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              使用飞书登录
            </Link>
          </div>
          <p className="mt-8 text-xs text-slate-500">
            首次登录会锁定租户；后续只允许同一飞书租户用户访问。
          </p>
          <div className="mt-6">
            <Link href="/" className="text-sm text-slate-700 underline underline-offset-4">
              返回首页
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const site = await getOrCreateDefaultSite();
  const [binding, pages, jobs] = await Promise.all([
    prisma.spaceBinding.findUnique({ where: { siteId: site.id } }),
    prisma.page.findMany({
      where: { siteId: site.id },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      include: {
        revisions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.syncJob.findMany({
      where: { siteId: site.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <AdminDashboard
      me={{
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl ?? undefined,
        role: user.role,
      }}
      initial={{
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
          theme: site.theme,
          homePageSlug: site.homePageSlug ?? undefined,
        },
        binding: binding
          ? {
              spaceId: binding.spaceId,
              rootNodeToken: binding.rootNodeToken ?? undefined,
              syncEnabled: binding.syncEnabled,
            }
          : null,
        pages: pages.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status,
          navVisible: p.navVisible,
          sort: p.sort,
          updatedAt: p.updatedAt.toISOString(),
          latestRevisionAt: p.revisions[0]?.createdAt.toISOString() ?? null,
        })),
        jobs: jobs.map((j) => ({
          id: j.id,
          type: j.type,
          status: j.status,
          error: j.error,
          createdAt: j.createdAt.toISOString(),
          finishedAt: j.finishedAt?.toISOString() ?? null,
        })),
      }}
    />
  );
}

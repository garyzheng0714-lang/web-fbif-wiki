"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";

type Me = {
  id: string;
  name: string;
  avatarUrl?: string;
  role: "ADMIN" | "EDITOR" | "VIEWER";
};

type DashboardState = {
  site: {
    id: string;
    slug: string;
    name: string;
    theme: string;
    homePageSlug?: string;
  };
  binding: {
    spaceId: string;
    rootNodeToken?: string;
    syncEnabled: boolean;
  } | null;
  pages: Array<{
    id: string;
    title: string;
    slug: string;
    status: "DRAFT" | "PUBLISHED";
    navVisible: boolean;
    sort: number;
    updatedAt: string;
    latestRevisionAt: string | null;
  }>;
  jobs: Array<{
    id: string;
    type: "FULL" | "POLL" | "FILE";
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
  }>;
};

type WikiSpace = {
  space_id: string;
  name: string;
  description?: string;
  visibility?: string;
  space_type?: string;
};

async function jsonFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error ?? `Request failed: ${res.status}`);
  }
  return json.data as T;
}

export function AdminDashboard({
  me,
  initial,
}: {
  me: Me;
  initial: DashboardState;
}) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [showBind, setShowBind] = useState(false);
  const [spaces, setSpaces] = useState<WikiSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>("");
  const [siteName, setSiteName] = useState(state.site.name);
  const [siteSlug, setSiteSlug] = useState(state.site.slug);
  const [theme, setTheme] = useState(state.site.theme);
  const [homePageSlug, setHomePageSlug] = useState(state.site.homePageSlug ?? "");

  const publishedCount = useMemo(
    () => state.pages.filter((p) => p.status === "PUBLISHED").length,
    [state.pages],
  );

  async function reloadAll() {
    const [siteData, pagesData, jobsData] = await Promise.all([
      jsonFetch<{
        site: DashboardState["site"];
        binding: DashboardState["binding"];
      }>("/api/site/current"),
      jsonFetch<{ items: DashboardState["pages"] }>("/api/pages"),
      jsonFetch<{ items: DashboardState["jobs"] }>("/api/sync/jobs"),
    ]);
    setState({
      site: siteData.site,
      binding: siteData.binding,
      pages: pagesData.items,
      jobs: jobsData.items,
    });
    setSiteName(siteData.site.name);
    setSiteSlug(siteData.site.slug);
    setTheme(siteData.site.theme);
    setHomePageSlug(siteData.site.homePageSlug ?? "");
  }

  function run(p: Promise<unknown>, success?: string) {
    startTransition(() => {
      setError("");
      setMessage("");
      p.then(async () => {
        await reloadAll();
        if (success) setMessage(success);
      }).catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      });
    });
  }

  function doLogout() {
    run(
      jsonFetch("/api/auth/logout", { method: "POST" }).then(() => {
        window.location.href = "/admin";
      }),
    );
  }

  function openBindModal() {
    run(
      jsonFetch<{ items: WikiSpace[] }>("/api/wiki/spaces").then((d) => {
        setSpaces(d.items);
        setSelectedSpaceId(d.items[0]?.space_id ?? "");
        setShowBind(true);
      }),
    );
  }

  function bindSpace() {
    if (!selectedSpaceId) return;
    run(
      jsonFetch("/api/site/bind-space", {
        method: "POST",
        body: JSON.stringify({ spaceId: selectedSpaceId }),
      }).then(() => setShowBind(false)),
      "知识库已绑定，已触发全量同步。",
    );
  }

  function triggerSync() {
    run(
      jsonFetch("/api/site/sync", { method: "POST" }),
      "同步任务已入队。",
    );
  }

  function saveSite() {
    run(
      jsonFetch("/api/site/current", {
        method: "PATCH",
        body: JSON.stringify({
          name: siteName,
          slug: siteSlug,
          theme,
          homePageSlug: homePageSlug || null,
        }),
      }),
      "站点配置已保存。",
    );
  }

  function updatePage(
    pageId: string,
    patch: Partial<{ status: "DRAFT" | "PUBLISHED"; navVisible: boolean; sort: number }>,
  ) {
    run(
      jsonFetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
      "页面已更新。",
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-slate-200 bg-white p-4">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-lg font-semibold">站点管理</h1>
          </div>
          <nav className="space-y-1 text-sm">
            {["站点信息", "页面管理", "导航设置", "外观样式", "域名设置", "权限管理"].map((item) => (
              <div
                key={item}
                className={clsx(
                  "rounded-lg px-3 py-2",
                  item === "站点信息" || item === "页面管理"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500",
                )}
              >
                {item}
              </div>
            ))}
          </nav>
          <div className="mt-8 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
            当前用户：{me.name}
            <br />
            角色：{me.role}
          </div>
          <button
            onClick={doLogout}
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            退出登录
          </button>
        </aside>

        <section className="flex-1 p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              onClick={triggerSync}
              disabled={pending || !state.binding}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              同步
            </button>
            <button
              onClick={openBindModal}
              disabled={pending}
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {state.binding ? "重新绑定知识库" : "绑定知识库"}
            </button>
            <a
              href={`/s/${state.site.slug}/${state.site.homePageSlug ?? state.pages.find((p) => p.status === "PUBLISHED")?.slug ?? ""}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
            >
              发布站点
            </a>
            <div className="ml-auto text-sm text-slate-500">
              已发布 {publishedCount} / 总计 {state.pages.length}
            </div>
          </div>

          {message ? (
            <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>
          ) : null}
          {error ? (
            <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">站点信息</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  <div className="mb-1 text-slate-500">站点名称</div>
                  <input
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-1 text-slate-500">站点 slug</div>
                  <input
                    value={siteSlug}
                    onChange={(e) => setSiteSlug(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                  />
                </label>
                <label className="text-sm">
                  <div className="mb-1 text-slate-500">主题</div>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                  >
                    <option value="clean">Clean 文档风</option>
                    <option value="help">Help Center 风</option>
                  </select>
                </label>
                <label className="text-sm">
                  <div className="mb-1 text-slate-500">首页页面 slug</div>
                  <input
                    value={homePageSlug}
                    onChange={(e) => setHomePageSlug(e.target.value)}
                    placeholder="留空则使用首个已发布页面"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                  />
                </label>
              </div>
              <button
                onClick={saveSite}
                disabled={pending}
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
              >
                保存站点配置
              </button>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">同步记录</h2>
              <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                {state.jobs.length === 0 ? (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">暂无同步记录</div>
                ) : (
                  state.jobs.map((job) => (
                    <div key={job.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span>{job.type}</span>
                        <span
                          className={clsx(
                            "rounded px-2 py-0.5 text-xs",
                            job.status === "SUCCEEDED" && "bg-emerald-100 text-emerald-700",
                            job.status === "FAILED" && "bg-rose-100 text-rose-700",
                            (job.status === "PENDING" || job.status === "RUNNING") &&
                              "bg-amber-100 text-amber-700",
                          )}
                        >
                          {job.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(job.createdAt).toLocaleString()}
                      </div>
                      {job.error ? <div className="mt-1 text-xs text-rose-700">{job.error}</div> : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">页面管理</h2>
            <div className="mt-4 overflow-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3">标题</th>
                    <th className="py-2 pr-3">Slug</th>
                    <th className="py-2 pr-3">状态</th>
                    <th className="py-2 pr-3">导航</th>
                    <th className="py-2 pr-3">排序</th>
                    <th className="py-2 pr-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {state.pages.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{p.title}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-600">{p.slug}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={clsx(
                            "rounded px-2 py-0.5 text-xs",
                            p.status === "PUBLISHED"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700",
                          )}
                        >
                          {p.status === "PUBLISHED" ? "已发布" : "未公开"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{p.navVisible ? "显示" : "隐藏"}</td>
                      <td className="py-2 pr-3">{p.sort}</td>
                      <td className="py-2 pr-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              updatePage(p.id, {
                                status: p.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED",
                              })
                            }
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            {p.status === "PUBLISHED" ? "取消发布" : "发布"}
                          </button>
                          <button
                            onClick={() => updatePage(p.id, { navVisible: !p.navVisible })}
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            {p.navVisible ? "隐藏导航" : "显示导航"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>

      {showBind ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold">绑定知识库内容</h3>
            <p className="mt-1 text-sm text-slate-500">
              站点内容基于飞书知识库同步，需要管理员权限。
            </p>
            <div className="mt-4 max-h-72 space-y-2 overflow-auto">
              {spaces.length === 0 ? (
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">未拉取到可用知识库</div>
              ) : (
                spaces.map((s) => (
                  <label
                    key={s.space_id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="space"
                      checked={selectedSpaceId === s.space_id}
                      onChange={() => setSelectedSpaceId(s.space_id)}
                    />
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.space_id}</div>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowBind(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={bindSpace}
                disabled={!selectedSpaceId}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
              >
                确认绑定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}


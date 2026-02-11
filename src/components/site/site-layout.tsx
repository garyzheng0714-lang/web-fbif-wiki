import Link from "next/link";
import clsx from "clsx";
import type { NavNode } from "@/server/navigation";

type TocItem = {
  id: string;
  level: number;
  text: string;
};

function NavTree({
  nodes,
  currentSlug,
  siteSlug,
}: {
  nodes: NavNode[];
  currentSlug?: string;
  siteSlug: string;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm">
      {nodes.map((n) => (
        <li key={n.nodeToken}>
          {n.pageSlug ? (
            <Link
              href={`/s/${siteSlug}/${n.pageSlug}`}
              className={clsx(
                "block rounded-md px-2 py-1.5",
                currentSlug === n.pageSlug
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-700 hover:bg-slate-100",
              )}
            >
              {n.title}
            </Link>
          ) : (
            <div className="rounded-md px-2 py-1.5 text-slate-400">{n.title}</div>
          )}
          {n.children.length > 0 ? (
            <div className="ml-3 mt-1 border-l border-slate-200 pl-2">
              <NavTree nodes={n.children} currentSlug={currentSlug} siteSlug={siteSlug} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function themeClass(theme: string) {
  if (theme === "help") return "theme-help";
  return "theme-clean";
}

export function SiteLayout({
  site,
  navTree,
  currentSlug,
  title,
  html,
  toc,
}: {
  site: { name: string; slug: string; theme: string };
  navTree: NavNode[];
  currentSlug?: string;
  title: string;
  html: string;
  toc: TocItem[];
}) {
  return (
    <main className={clsx("min-h-screen", themeClass(site.theme))}>
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 lg:grid-cols-[320px_1fr_260px]">
        <aside className="border-b border-slate-200 bg-white p-4 lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600/15" />
            <div>
              <div className="text-lg font-semibold text-slate-900">{site.name}</div>
              <div className="text-xs text-slate-500">知识库文档站</div>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto pr-1">
            <NavTree nodes={navTree} currentSlug={currentSlug} siteSlug={site.slug} />
          </div>
        </aside>

        <article className="min-h-screen bg-white px-5 py-8 md:px-10">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <div
              className="fbif-doc mt-8"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </article>

        <aside className="hidden border-l border-slate-200 bg-white p-5 lg:block">
          <div className="text-sm font-semibold text-slate-900">本页内容</div>
          <div className="mt-3 space-y-1">
            {toc.length === 0 ? (
              <div className="text-sm text-slate-400">暂无目录</div>
            ) : (
              toc.map((t) => (
                <a
                  key={`${t.id}-${t.level}`}
                  href={`#${t.id}`}
                  className="block text-sm text-slate-600 hover:text-blue-700"
                  style={{ paddingLeft: `${(t.level - 1) * 10}px` }}
                >
                  {t.text}
                </a>
              ))
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}


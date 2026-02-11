import type { Page, WikiNode } from "@prisma/client";

export type NavNode = {
  nodeToken: string;
  title: string;
  pageSlug: string | null;
  status: "PUBLISHED" | "DRAFT" | null;
  children: NavNode[];
};

export function buildNavTree(
  nodes: Array<Pick<WikiNode, "nodeToken" | "parentNodeToken" | "title">>,
  pages: Array<Pick<Page, "nodeToken" | "slug" | "status" | "navVisible">>,
  opts?: { onlyPublished?: boolean },
): NavNode[] {
  const onlyPublished = opts?.onlyPublished ?? false;
  const pageByNode = new Map(pages.map((p) => [p.nodeToken, p]));

  const childrenMap = new Map<string | null, NavNode[]>();
  const ensure = (k: string | null) => {
    const arr = childrenMap.get(k);
    if (arr) return arr;
    const next: NavNode[] = [];
    childrenMap.set(k, next);
    return next;
  };

  for (const n of nodes) {
    const p = pageByNode.get(n.nodeToken);
    if (onlyPublished && (!p || p.status !== "PUBLISHED")) continue;
    if (p && p.navVisible === false) continue;

    const nav: NavNode = {
      nodeToken: n.nodeToken,
      title: n.title,
      pageSlug: p?.slug ?? null,
      status: p?.status ?? null,
      children: [],
    };
    ensure(n.parentNodeToken ?? null).push(nav);
  }

  function attach(parentToken: string | null): NavNode[] {
    const list = ensure(parentToken);
    for (const n of list) n.children = attach(n.nodeToken);
    return list;
  }

  return attach(null);
}


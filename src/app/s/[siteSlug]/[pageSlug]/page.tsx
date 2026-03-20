import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { buildNavTree } from "@/server/navigation";
import { SiteLayout } from "@/components/site/site-layout";

export default async function PublishedPage({
  params,
}: {
  params: { siteSlug: string; pageSlug: string };
}) {
  const site = await prisma.site.findUnique({
    where: { slug: params.siteSlug },
  });
  if (!site) notFound();

  const page = await prisma.page.findUnique({
    where: { siteId_slug: { siteId: site.id, slug: params.pageSlug } },
  });
  if (!page || page.status !== "PUBLISHED") notFound();

  const latest = await prisma.pageRevision.findFirst({
    where: { pageId: page.id },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) notFound();

  const [nodes, pages] = await Promise.all([
    prisma.wikiNode.findMany({ where: { siteId: site.id } }),
    prisma.page.findMany({ where: { siteId: site.id } }),
  ]);
  const navTree = buildNavTree(nodes, pages, { onlyPublished: true });
  const toc =
    Array.isArray(latest.tocJson)
      ? latest.tocJson
          .map((item) => {
            if (
              typeof item === "object" &&
              item !== null &&
              typeof (item as { id?: unknown }).id === "string" &&
              typeof (item as { level?: unknown }).level === "number" &&
              typeof (item as { text?: unknown }).text === "string"
            ) {
              return {
                id: (item as { id: string }).id,
                level: (item as { level: number }).level,
                text: (item as { text: string }).text,
              };
            }
            return null;
          })
          .filter((x): x is { id: string; level: number; text: string } => Boolean(x))
      : [];

  return (
    <SiteLayout
      site={{ name: site.name, slug: site.slug, theme: site.theme }}
      navTree={navTree}
      currentSlug={page.slug}
      title={page.title}
      html={latest.html}
      toc={toc}
    />
  );
}

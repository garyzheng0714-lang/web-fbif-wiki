export function makeSafeSlug(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replaceAll(/[\s]+/g, "-")
    .replaceAll(/[^a-z0-9\-_]/g, "");
  return s.replaceAll(/^-+|-+$/g, "").slice(0, 80);
}

export function makePageSlug(title: string, nodeToken: string): string {
  const s = makeSafeSlug(title);
  if (s) return s;
  return `n-${nodeToken.slice(0, 8)}`;
}


import crypto from "node:crypto";
import type { DocxBlockItem, DocxTextElement } from "@/server/feishu/client";

export type TocItem = {
  id: string;
  level: number;
  text: string;
};

export type RenderResult = {
  html: string;
  toc: TocItem[];
  hash: string;
};

type ElementList = DocxTextElement[] | undefined;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugifyAnchor(s: string): string {
  const cleaned = s
    .trim()
    .toLowerCase()
    .replaceAll(/[\s]+/g, "-")
    .replaceAll(/[^a-z0-9\-_]/g, "");
  if (cleaned) return cleaned.slice(0, 80);
  return `h-${crypto.createHash("sha1").update(s).digest("hex").slice(0, 10)}`;
}

function getMentionUserId(el: DocxTextElement): string | null {
  if (el.mention_user && typeof el.mention_user.user_id === "string") {
    return el.mention_user.user_id;
  }
  return null;
}

function getEquationContent(el: DocxTextElement): string | null {
  if (el.equation && typeof el.equation.content === "string") {
    return el.equation.content;
  }
  return null;
}

function getStyleLinkUrl(style: Record<string, unknown>): string | null {
  const raw = style.link;
  if (typeof raw !== "object" || raw === null) return null;
  const url = (raw as { url?: unknown }).url;
  if (typeof url !== "string") return null;
  return url;
}

function textFromElements(elements: ElementList): string {
  if (!elements) return "";
  let out = "";
  for (const el of elements) {
    if (el.text_run?.content) out += el.text_run.content;
    else if (getMentionUserId(el)) out += "@user";
    else {
      const eq = getEquationContent(el);
      if (eq) out += eq;
    }
  }
  return out;
}

function renderInlineElements(elements: ElementList): string {
  if (!elements) return "";
  return elements
    .map((el) => {
      if (el.text_run) {
        const style = (el.text_run.text_element_style ?? {}) as Record<string, unknown>;
        let html = escapeHtml(el.text_run.content ?? "");

        const isBold = style.bold === true;
        const isItalic = style.italic === true;
        const isUnderline = style.underline === true;
        const isStrike = style.strikethrough === true;
        const isCode = style.inline_code === true;
        const link = getStyleLinkUrl(style);

        if (link) {
          html = `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
        }
        if (isCode) html = `<code class="fbif-inline-code">${html}</code>`;
        if (isBold) html = `<strong>${html}</strong>`;
        if (isItalic) html = `<em>${html}</em>`;
        if (isUnderline) html = `<u>${html}</u>`;
        if (isStrike) html = `<s>${html}</s>`;
        return html;
      }

      if (getMentionUserId(el)) {
        return `<span class="fbif-mention">@user</span>`;
      }

      const equation = getEquationContent(el);
      if (equation) {
        return `<span class="fbif-equation">${escapeHtml(equation)}</span>`;
      }
      return "";
    })
    .join("");
}

function renderBlockContent(block: DocxBlockItem): string {
  if (block.text?.elements) return renderInlineElements(block.text.elements);
  if (block.heading?.elements) return renderInlineElements(block.heading.elements);
  if (block.code?.elements) {
    const codeText = (block.code.elements ?? []).map((e) => e.text_run?.content ?? "").join("");
    return escapeHtml(codeText);
  }
  return "";
}

export function renderDocxBlocksToHtml(blocks: DocxBlockItem[]): RenderResult {
  const byId = new Map<string, DocxBlockItem>();
  for (const b of blocks) byId.set(b.block_id, b);

  const roots: DocxBlockItem[] = [];
  for (const b of blocks) {
    const pid = b.parent_id;
    if (!pid || !byId.has(pid)) roots.push(b);
  }

  const toc: TocItem[] = [];
  const rendered = new Set<string>();

  function renderBlock(block: DocxBlockItem): string {
    if (rendered.has(block.block_id)) return "";
    rendered.add(block.block_id);

    const t = block.block_type;
    const children = (block.children ?? [])
      .map((id) => byId.get(id))
      .filter((x): x is DocxBlockItem => Boolean(x));

    const content = renderBlockContent(block);

    const m = /^heading([1-6])$/.exec(t);
    if (m) {
      const level = Number(m[1]);
      const text = textFromElements(block.text?.elements) || content.replaceAll(/<[^>]*>/g, "");
      const id = slugifyAnchor(text || block.block_id);
      toc.push({ id, level, text: text.trim() || `Heading ${level}` });
      return `<h${level} id="${id}" class="fbif-h fbif-h${level}">${content || escapeHtml(text)}</h${level}>${renderChildren(children)}`;
    }

    switch (t) {
      case "page":
        return renderChildren(children);
      case "text":
      case "paragraph":
        return `<p class="fbif-p">${content}</p>${renderChildren(children)}`;
      case "quote":
        return `<blockquote class="fbif-quote">${content || renderChildren(children)}</blockquote>`;
      case "code": {
        const lang = (block.code?.language ?? "").toString();
        const codeHtml = content;
        return `<pre class="fbif-pre"><code class="fbif-code ${lang ? `language-${escapeHtml(lang)}` : ""}">${codeHtml}</code></pre>${renderChildren(children)}`;
      }
      case "divider":
        return `<hr class="fbif-hr" />${renderChildren(children)}`;
      case "callout":
        return `<aside class="fbif-callout">${content || renderChildren(children)}</aside>`;
      case "image":
        return `<div class="fbif-unsupported">[Image block not yet supported]</div>`;
      case "file":
        return `<div class="fbif-unsupported">[File block not yet supported]</div>`;
      case "table":
        return `<div class="fbif-unsupported">[Table block not yet supported]</div>`;
      case "bullet":
      case "ordered":
      case "todo":
        return `<div class="fbif-unsupported">[List item at root]</div>`;
      default:
        return `<div class="fbif-unknown" data-block-type="${escapeHtml(t)}">${content}${renderChildren(children)}</div>`;
    }
  }

  function renderChildren(children: DocxBlockItem[]): string {
    if (children.length === 0) return "";

    let html = "";
    for (let i = 0; i < children.length; ) {
      const c = children[i];
      const t = c.block_type;
      if (t === "bullet" || t === "ordered") {
        const isOrdered = t === "ordered";
        const tag = isOrdered ? "ol" : "ul";
        const cls = isOrdered ? "fbif-ol" : "fbif-ul";
        let listHtml = "";
        while (i < children.length && children[i].block_type === t) {
          const item = children[i];
          const itemChildren = (item.children ?? [])
            .map((id) => byId.get(id))
            .filter((x): x is DocxBlockItem => Boolean(x));
          const itemContent = renderBlockContent(item);
          listHtml += `<li class="fbif-li">${itemContent}${renderChildren(itemChildren)}</li>`;
          rendered.add(item.block_id);
          i++;
        }
        html += `<${tag} class="${cls}">${listHtml}</${tag}>`;
        continue;
      }
      if (t === "todo") {
        let listHtml = "";
        while (i < children.length && children[i].block_type === "todo") {
          const item = children[i];
          const itemChildren = (item.children ?? [])
            .map((id) => byId.get(id))
            .filter((x): x is DocxBlockItem => Boolean(x));
          const itemContent = renderBlockContent(item);
          const done = item.todo?.is_done === true;
          listHtml += `<li class="fbif-li"><label class="fbif-todo"><input type="checkbox" disabled ${done ? "checked" : ""}/> <span>${itemContent}</span></label>${renderChildren(itemChildren)}</li>`;
          rendered.add(item.block_id);
          i++;
        }
        html += `<ul class="fbif-ul">${listHtml}</ul>`;
        continue;
      }

      html += renderBlock(c);
      i++;
    }
    return html;
  }

  const pageRoot = roots.find((r) => r.block_type === "page");
  const htmlBody = pageRoot ? renderBlock(pageRoot) : roots.map(renderBlock).join("");

  const hash = crypto.createHash("sha256").update(htmlBody).digest("hex");
  return { html: htmlBody, toc, hash };
}

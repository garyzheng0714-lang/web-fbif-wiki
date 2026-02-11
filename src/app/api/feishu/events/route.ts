import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { badRequest } from "@/server/http";
import { env } from "@/server/env";
import { getOrCreateDefaultSite } from "@/server/site";
import { enqueuePollSync } from "@/server/queue";

function verifyToken(token?: string): boolean {
  if (!env.FEISHU_VERIFICATION_TOKEN) return true;
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(env.FEISHU_VERIFICATION_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function verifySignature(req: NextRequest, body: string): boolean {
  // Optional signature check for extra hardening.
  const nonce = req.headers.get("X-Lark-Request-Nonce") ?? "";
  const timestamp = req.headers.get("X-Lark-Request-Timestamp") ?? "";
  const signature = req.headers.get("X-Lark-Signature") ?? "";
  if (!env.FEISHU_ENCRYPT_KEY || !signature || !timestamp) return true;
  const raw = `${timestamp}${nonce}${env.FEISHU_ENCRYPT_KEY}${body}`;
  const expected = createHash("sha256").update(raw).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();
  let body: unknown = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return badRequest("Invalid JSON");
  }

  if (!verifySignature(req, bodyText)) {
    return badRequest("Invalid signature", 401);
  }

  const maybeBody = body as {
    type?: unknown;
    token?: unknown;
    challenge?: unknown;
    header?: { event_type?: unknown };
  };

  if (maybeBody.type === "url_verification") {
    if (!verifyToken(typeof maybeBody.token === "string" ? maybeBody.token : undefined)) {
      return badRequest("Invalid token", 401);
    }
    return NextResponse.json({
      challenge: typeof maybeBody.challenge === "string" ? maybeBody.challenge : "",
    });
  }

  if (maybeBody.header?.event_type === "drive.file.edit_v1") {
    const site = await getOrCreateDefaultSite();
    await enqueuePollSync(site.id);
  }
  return NextResponse.json({ ok: true });
}

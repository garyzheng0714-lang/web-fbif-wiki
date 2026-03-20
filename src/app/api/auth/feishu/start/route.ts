import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildFeishuOAuthUrl } from "@/server/feishu/oauth";
import { env } from "@/server/env";

const FEISHU_OAUTH_STATE_COOKIE = "fbif_oauth_state";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return NextResponse.redirect(new URL("/admin?error=missing_feishu_config", env.APP_BASE_URL));
  }
  const secureCookie = new URL(req.url).protocol === "https:";
  const state = randomBytes(16).toString("hex");
  cookies().set(FEISHU_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
  return NextResponse.redirect(buildFeishuOAuthUrl(state));
}

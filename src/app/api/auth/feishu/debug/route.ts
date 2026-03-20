import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { buildFeishuOAuthUrl, getFeishuOAuthRedirectUri } from "@/server/feishu/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = "debug_state";
  return NextResponse.json({
    ok: true,
    data: {
      appId: env.FEISHU_APP_ID ? `${env.FEISHU_APP_ID.slice(0, 8)}...` : "",
      appBaseUrl: env.APP_BASE_URL,
      redirectUri: getFeishuOAuthRedirectUri(),
      authorizeUrl: buildFeishuOAuthUrl(state),
      scope: env.FEISHU_OAUTH_SCOPE ?? "",
    },
  });
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { assertTenantAllowed } from "@/server/appConfig";
import { encryptString } from "@/server/crypto";
import { env } from "@/server/env";
import {
  exchangeCodeForUserToken,
  getUserInfo,
} from "@/server/feishu/client";
import { signSession, SESSION_COOKIE_NAME } from "@/server/session";

const FEISHU_OAUTH_STATE_COOKIE = "fbif_oauth_state";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const appBaseUrl = new URL(env.APP_BASE_URL);
    const secureCookie = appBaseUrl.protocol === "https:";
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = cookies().get(FEISHU_OAUTH_STATE_COOKIE)?.value;

    if (!code || !state || !savedState || state !== savedState) {
      return NextResponse.redirect(new URL("/admin?error=oauth_state", appBaseUrl));
    }

    const tokenData = await exchangeCodeForUserToken(code);
    await assertTenantAllowed(tokenData.tenant_key);

    const userInfo = await getUserInfo(tokenData.access_token);
    const tenantKey = userInfo.tenant_key ?? tokenData.tenant_key;
    const openId = userInfo.open_id ?? tokenData.open_id;
    const feishuUserId = userInfo.user_id ?? tokenData.user_id ?? openId;
    if (!tenantKey || !openId || !feishuUserId) {
      throw new Error("Missing user identifiers from Feishu OAuth response");
    }

    const user = await prisma.adminUser.upsert({
      where: { openId },
      create: {
        tenantKey,
        feishuUserId,
        openId,
        name: userInfo.name,
        avatarUrl: userInfo.avatar_url,
        role: "ADMIN",
      },
      update: {
        tenantKey,
        feishuUserId,
        openId,
        name: userInfo.name,
        avatarUrl: userInfo.avatar_url,
      },
    });

    const accessTokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    await prisma.feishuOAuthToken.upsert({
      where: {
        userId_tenantKey: { userId: user.id, tenantKey },
      },
      create: {
        userId: user.id,
        tenantKey,
        accessTokenEnc: encryptString(tokenData.access_token),
        refreshTokenEnc: encryptString(tokenData.refresh_token),
        accessTokenExpiresAt,
      },
      update: {
        accessTokenEnc: encryptString(tokenData.access_token),
        refreshTokenEnc: encryptString(tokenData.refresh_token),
        accessTokenExpiresAt,
      },
    });

    const session = await signSession({ userId: user.id });
    const res = NextResponse.redirect(new URL("/admin", appBaseUrl));
    res.cookies.set(SESSION_COOKIE_NAME, session, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    res.cookies.set(FEISHU_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("feishu callback error", e);
    const appBaseUrl = new URL(env.APP_BASE_URL);
    return NextResponse.redirect(new URL("/admin?error=oauth_failed", appBaseUrl));
  }
}

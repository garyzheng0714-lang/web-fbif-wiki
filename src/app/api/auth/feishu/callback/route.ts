import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { assertTenantAllowed } from "@/server/appConfig";
import { encryptString } from "@/server/crypto";
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
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = cookies().get(FEISHU_OAUTH_STATE_COOKIE)?.value;

    if (!code || !state || !savedState || state !== savedState) {
      return NextResponse.redirect(new URL("/admin?error=oauth_state", url.origin));
    }

    const tokenData = await exchangeCodeForUserToken(code);
    await assertTenantAllowed(tokenData.tenant_key);

    const userInfo = await getUserInfo(tokenData.access_token);

    const user = await prisma.adminUser.upsert({
      where: { feishuUserId: userInfo.user_id },
      create: {
        tenantKey: userInfo.tenant_key,
        feishuUserId: userInfo.user_id,
        openId: userInfo.open_id,
        name: userInfo.name,
        avatarUrl: userInfo.avatar_url,
        role: "ADMIN",
      },
      update: {
        tenantKey: userInfo.tenant_key,
        openId: userInfo.open_id,
        name: userInfo.name,
        avatarUrl: userInfo.avatar_url,
      },
    });

    const accessTokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    await prisma.feishuOAuthToken.upsert({
      where: {
        userId_tenantKey: { userId: user.id, tenantKey: userInfo.tenant_key },
      },
      create: {
        userId: user.id,
        tenantKey: userInfo.tenant_key,
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
    const res = NextResponse.redirect(new URL("/admin", url.origin));
    res.cookies.set(SESSION_COOKIE_NAME, session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    res.cookies.set(FEISHU_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("feishu callback error", e);
    const origin = new URL(req.url).origin;
    return NextResponse.redirect(new URL("/admin?error=oauth_failed", origin));
  }
}

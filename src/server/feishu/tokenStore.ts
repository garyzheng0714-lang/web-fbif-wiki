import { prisma } from "@/server/db";
import { decryptString, encryptString } from "@/server/crypto";
import { refreshUserAccessToken } from "@/server/feishu/client";

export async function storeUserToken(params: {
  userId: string;
  tenantKey: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
}) {
  await prisma.feishuOAuthToken.upsert({
    where: {
      userId_tenantKey: { userId: params.userId, tenantKey: params.tenantKey },
    },
    create: {
      userId: params.userId,
      tenantKey: params.tenantKey,
      accessTokenEnc: encryptString(params.accessToken),
      refreshTokenEnc: encryptString(params.refreshToken),
      accessTokenExpiresAt: params.accessTokenExpiresAt,
    },
    update: {
      accessTokenEnc: encryptString(params.accessToken),
      refreshTokenEnc: encryptString(params.refreshToken),
      accessTokenExpiresAt: params.accessTokenExpiresAt,
    },
  });
}

export async function getValidUserAccessToken(userId: string): Promise<{
  tenantKey: string;
  accessToken: string;
}> {
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Admin user not found");

  const tokenRow = await prisma.feishuOAuthToken.findUnique({
    where: { userId_tenantKey: { userId: user.id, tenantKey: user.tenantKey } },
  });
  if (!tokenRow) throw new Error("Feishu token not found; please re-login");

  const now = Date.now();
  const expiresAt = tokenRow.accessTokenExpiresAt.getTime();
  if (expiresAt - 60_000 > now) {
    return {
      tenantKey: tokenRow.tenantKey,
      accessToken: decryptString(tokenRow.accessTokenEnc),
    };
  }

  const refreshToken = decryptString(tokenRow.refreshTokenEnc);
  const refreshed = await refreshUserAccessToken(refreshToken);
  const nextExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  await storeUserToken({
    userId: user.id,
    tenantKey: user.tenantKey,
    accessToken: refreshed.access_token,
    accessTokenExpiresAt: nextExpiresAt,
    refreshToken: refreshed.refresh_token,
  });

  return { tenantKey: user.tenantKey, accessToken: refreshed.access_token };
}


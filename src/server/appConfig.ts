import { prisma } from "@/server/db";
import { env } from "@/server/env";

const KEY_ALLOWED_TENANT = "allowedTenantKey";

export async function assertTenantAllowed(tenantKey: string) {
  if (env.FEISHU_ALLOWED_TENANT_KEY && env.FEISHU_ALLOWED_TENANT_KEY !== tenantKey) {
    throw new Error("Tenant not allowed by FEISHU_ALLOWED_TENANT_KEY");
  }

  const row = await prisma.appConfig.findUnique({ where: { key: KEY_ALLOWED_TENANT } });
  if (!row) {
    await prisma.appConfig.create({
      data: { key: KEY_ALLOWED_TENANT, value: tenantKey },
    });
    return;
  }
  if (row.value !== tenantKey) {
    throw new Error("Tenant not allowed (locked to first login)");
  }
}


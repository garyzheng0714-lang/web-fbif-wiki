import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { getTenantAccessToken } from "@/server/feishu/client";

export async function GET() {
  if (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing FEISHU_APP_ID/FEISHU_APP_SECRET",
      },
      { status: 400 },
    );
  }

  try {
    const token = await getTenantAccessToken();
    return NextResponse.json({
      ok: true,
      data: {
        authOk: true,
        tokenPreview: `${token.slice(0, 8)}...`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}


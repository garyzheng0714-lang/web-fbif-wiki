import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const windowMs = 60_000;
const maxPerWindow = 120;

const buckets = new Map<string, { count: number; resetAt: number }>();

function getKey(req: NextRequest): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown";
  return `${req.nextUrl.pathname}:${ip}`;
}

export function middleware(req: NextRequest) {
  if (
    req.nextUrl.pathname.startsWith("/api/feishu/events") ||
    req.nextUrl.pathname.startsWith("/s/")
  ) {
    const now = Date.now();
    const key = getKey(req);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return NextResponse.next();
    }
    bucket.count += 1;
    if (bucket.count > maxPerWindow) {
      return NextResponse.json(
        { ok: false, error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    return NextResponse.next();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/s/:path*"],
};


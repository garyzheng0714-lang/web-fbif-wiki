import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/server/session";

export async function POST(req: Request) {
  const secureCookie = new URL(req.url).protocol === "https:";
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

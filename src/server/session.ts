import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/server/env";

export const SESSION_COOKIE_NAME = "fbif_session";

type SessionPayload = {
  userId: string;
};

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // 7 days
  const exp = now + 60 * 60 * 24 * 7;
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecretKey());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecretKey());
  if (!payload || typeof payload.userId !== "string") {
    throw new Error("Invalid session payload");
  }
  return { userId: payload.userId };
}

export async function getSessionFromRequest(
  req: NextRequest,
): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}

export async function getSessionFromServerCookies(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}


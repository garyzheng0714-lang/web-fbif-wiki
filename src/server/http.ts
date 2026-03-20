import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function badRequest(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
    },
  );
}

export function serverError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json(
    { ok: false, error: message },
    {
      status: 500,
    },
  );
}


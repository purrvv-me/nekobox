import { NextResponse } from "next/server";

// Small helpers for consistent JSON responses across API routes.
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function error(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export const unauthorized = () => error("Unauthorized", 401);
export const notFound = (what = "Resource") => error(`${what} not found`, 404);
export const forbidden = () => error("Forbidden", 403);

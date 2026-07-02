import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const COOKIE_NAME = "nekobox_session";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET is missing or too short. Set it in .env.");
  }
  return new TextEncoder().encode(secret);
}

function ttlSeconds(): number {
  return Number(process.env.JWT_TTL_SECONDS ?? 60 * 60 * 24 * 7);
}

// Password hashing lives in a Next-free module so it can be unit-tested.
export { hashPassword, verifyPassword, verifyPasswordDummy } from "./password";

// ─── JWT session tokens ───────────────────────────────────────────────
export interface SessionClaims {
  sub: string; // user id
  email: string;
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds())
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

// ─── Cookie helpers ───────────────────────────────────────────────────
export function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds(),
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Resolve the authenticated user from the request cookie.
 * Returns null when there is no valid session — callers should 401.
 */
export async function getSession(req?: NextRequest): Promise<SessionClaims | null> {
  const token = req
    ? req.cookies.get(COOKIE_NAME)?.value
    : cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export { COOKIE_NAME };

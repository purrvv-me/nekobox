import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { ok, error } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return error("Too many accounts created. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return error("Invalid registration payload", 422);

  const {
    email,
    password,
    kdfSalt,
    wrappedVmk,
    wrappedVmkIv,
    recoverySalt,
    recoveryWrappedVmk,
    recoveryWrappedVmkIv,
    kdfIterations,
  } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return error("An account with that email already exists", 409);

  const passwordHash = await hashPassword(password);

  let user: { id: string; email: string };
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        kdfSalt,
        kdfIterations,
        wrappedVmk,
        wrappedVmkIv,
        recoverySalt,
        recoveryWrappedVmk,
        recoveryWrappedVmkIv,
      },
      select: { id: true, email: true },
    });
  } catch (err) {
    // Surface a meaningful message instead of a bare 500 — most often this is
    // an unreachable database or a schema that hasn't been pushed yet.
    console.error("register: db error", err);
    return error("Could not reach the database. Is it running and migrated?", 503);
  }

  const token = await createSessionToken({ sub: user.id, email: user.email });
  setSessionCookie(token);

  return ok({ id: user.id, email: user.email }, { status: 201 });
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, verifyPasswordDummy, createSessionToken, setSessionCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { ok, error } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
  if (!limit.ok) return error("Too many login attempts. Try later.", 429);

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return error("Invalid login payload", 422);

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Always perform an argon2 verify (real hash or a dummy) so the response time
  // doesn't reveal whether the account exists.
  let valid = false;
  if (user) valid = await verifyPassword(user.passwordHash, password);
  else await verifyPasswordDummy(password);
  if (!user || !valid) return error("Invalid email or password", 401);

  const token = await createSessionToken({ sub: user.id, email: user.email });
  setSessionCookie(token);

  // Return the wrapped key material the client needs to rebuild its keys.
  return ok({
    id: user.id,
    email: user.email,
    kdfSalt: user.kdfSalt,
    kdfIterations: user.kdfIterations,
    wrappedVmk: user.wrappedVmk,
    wrappedVmkIv: user.wrappedVmkIv,
    encPrivateKey: user.encPrivateKey,
    encPrivateKeyIv: user.encPrivateKeyIv,
    publicKey: user.publicKey,
  });
}

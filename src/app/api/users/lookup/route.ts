import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ok, error, unauthorized, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";

// Look up a recipient's PUBLIC key by email so the client can wrap a file's
// DEK for them. Auth-required and rate-limited to limit enumeration.
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const limit = rateLimit(`lookup:${session.sub}`, 30, 60 * 1000);
  if (!limit.ok) return error("Too many lookups. Slow down.", 429);

  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return error("email query param required", 400);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, publicKey: true },
  });
  if (!user) return notFound("User");
  if (user.id === session.sub) return error("You cannot share with yourself", 400);

  return ok(user);
}

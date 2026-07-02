import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/http";

// Returns the current user plus the wrapped key material needed to rehydrate
// crypto keys after a page reload (the master key itself is never stored).
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      kdfSalt: true,
      kdfIterations: true,
      wrappedVmk: true,
      wrappedVmkIv: true,
      encPrivateKey: true,
      encPrivateKeyIv: true,
      publicKey: true,
    },
  });
  if (!user) return unauthorized();

  return ok(user);
}

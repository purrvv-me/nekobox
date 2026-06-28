import { clearSessionCookie } from "@/lib/auth";
import { ok } from "@/lib/http";

export async function POST() {
  clearSessionCookie();
  return ok({ ok: true });
}

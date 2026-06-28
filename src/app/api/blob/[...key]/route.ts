import { NextRequest } from "next/server";
import { isR2Configured, readLocal, verifyLocalSig, writeLocal } from "@/lib/storage";

// Local-storage blob endpoint (only active when R2 is NOT configured).
// Access is gated by short-lived HMAC capability tokens issued server-side in
// storage.ts — exactly like an R2 presigned URL, so shared downloads work
// without leaking session ownership. Bodies are already client-encrypted.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parse(req: NextRequest, key: string[]) {
  const sp = req.nextUrl.searchParams;
  return {
    key: key.map(decodeURIComponent).join("/"),
    exp: sp.get("exp"),
    sig: sp.get("sig"),
  };
}

export async function PUT(req: NextRequest, { params }: { params: { key: string[] } }) {
  if (isR2Configured()) return new Response("Not found", { status: 404 });
  const { key, exp, sig } = parse(req, params.key);
  if (!verifyLocalSig("put", key, exp, sig)) return new Response("Forbidden", { status: 403 });

  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 104857600);
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.byteLength > maxBytes) return new Response("Payload too large", { status: 413 });

  await writeLocal(key, data);
  return new Response(null, { status: 200 });
}

export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  if (isR2Configured()) return new Response("Not found", { status: 404 });
  const { key, exp, sig } = parse(req, params.key);
  if (!verifyLocalSig("get", key, exp, sig)) return new Response("Forbidden", { status: 403 });

  const data = await readLocal(key);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.length),
      "Cache-Control": "no-store",
    },
  });
}

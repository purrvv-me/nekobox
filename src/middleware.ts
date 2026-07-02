import { NextRequest, NextResponse } from "next/server";
import { buildCsp, STATIC_SECURITY_HEADERS } from "@/lib/securityHeaders";

// Attaches a per-request CSP (with a fresh script nonce) + hardening headers to
// every response. Next reads the CSP from the request header to nonce its own
// scripts, so 'strict-dynamic' works without 'unsafe-inline' for scripts.
export function middleware(req: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));
  const csp = buildCsp(nonce, { isProd });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) res.headers.set(k, v);
  if (isProd) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return res;
}

export const config = {
  // Run on everything except Next's static assets and the favicon.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

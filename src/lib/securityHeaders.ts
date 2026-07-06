// Content-Security-Policy + hardening headers.
//
// For a zero-knowledge app an XSS is catastrophic (it can hook the password or
// exfiltrate the in-memory master key), so CSP is the primary defence-in-depth.
// Scripts are locked to a per-request nonce + 'strict-dynamic' (see middleware).

export interface CspOptions {
  isProd: boolean;
  /** Extra origins allowed for XHR/fetch (e.g. a custom R2 endpoint). */
  connectSrc?: string[];
}

export function buildCsp(nonce: string, opts: CspOptions): string {
  const { isProd } = opts;

  // In dev, Next's bundler / react-refresh need 'unsafe-eval'. Never in prod.
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (!isProd) scriptSrc.push("'unsafe-eval'");

  const connectSrc = [
    "'self'",
    "https://*.backblazeb2.com", // presigned B2 up/downloads
    "https://*.r2.cloudflarestorage.com", // presigned R2 up/downloads (also supported)
    ...(opts.connectSrc ?? []),
  ];
  if (!isProd) connectSrc.push("ws:"); // HMR websocket in dev

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'none'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "img-src": ["'self'", "blob:", "data:"],
    "media-src": ["'self'", "blob:"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    // style-src can't use a nonce reliably with Tailwind/Next-injected styles;
    // 'unsafe-inline' for *styles only* is low-risk (no script execution).
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "script-src": scriptSrc,
    "connect-src": connectSrc,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (isProd) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Static (non-nonce) hardening headers applied to every response. */
export const STATIC_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-DNS-Prefetch-Control": "off",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

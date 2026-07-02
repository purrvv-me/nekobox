import { describe, it, expect } from "vitest";
import { buildCsp, STATIC_SECURITY_HEADERS } from "./securityHeaders";

describe("Content-Security-Policy (H1)", () => {
  const prod = buildCsp("N0NCE", { isProd: true });
  const dev = buildCsp("N0NCE", { isProd: false });

  it("locks down the dangerous fetch/frame/object surfaces", () => {
    expect(prod).toContain("default-src 'self'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("base-uri 'none'");
    expect(prod).toContain("form-action 'self'");
  });

  it("binds scripts to the per-request nonce with strict-dynamic", () => {
    expect(prod).toContain("script-src 'self' 'nonce-N0NCE' 'strict-dynamic'");
  });

  it("never allows unsafe-eval in production (only dev)", () => {
    expect(prod).not.toContain("'unsafe-eval'");
    expect(dev).toContain("'unsafe-eval'");
  });

  it("allows presigned R2 uploads in connect-src", () => {
    expect(prod).toContain("connect-src 'self' https://*.r2.cloudflarestorage.com");
  });

  it("adds custom connect-src origins when provided", () => {
    const csp = buildCsp("N", { isProd: true, connectSrc: ["https://api.example.com"] });
    expect(csp).toContain("https://api.example.com");
  });

  it("upgrades insecure requests only in production", () => {
    expect(prod).toContain("upgrade-insecure-requests");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("static headers deny framing and sniffing", () => {
    expect(STATIC_SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(STATIC_SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(STATIC_SECURITY_HEADERS["Referrer-Policy"]).toBe("no-referrer");
  });
});

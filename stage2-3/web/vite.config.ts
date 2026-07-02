import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The Explorer imports the Stage 1 crypto module directly from the repo root
// (../../src/crypto/secure) via the "@secure" alias — no duplication.
const secure = fileURLToPath(new URL("../../src/crypto/secure", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@secure": secure },
  },
  server: {
    port: 5173,
    // Allow importing files from outside this package's root (the shared module).
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
    // Static hardening in dev (no strict CSP — it would break HMR).
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  },
  // The built app is fully bundled (script-src 'self'), so a real CSP applies.
  preview: {
    headers: {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": [
        "default-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "img-src 'self' blob: data:",
        "media-src 'self' blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "script-src 'self'",
        // adjust to your backend origin in production:
        "connect-src 'self' http://localhost:4000",
      ].join("; "),
    },
  },
});

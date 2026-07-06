import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "NekoBox — Encrypted Vault",
  description: "Your private, end-to-end encrypted file vault.",
};

// Force per-request (dynamic) rendering for the whole app. Our CSP is strict
// (nonce + 'strict-dynamic', no 'unsafe-inline'), and Next only injects the
// per-request nonce into its inline bootstrap/RSC scripts when a page renders
// at request time. Statically prerendered pages have no request context, so
// they'd ship nonce-less scripts that the CSP then blocks — producing a blank
// page in production. Dynamic rendering keeps header-nonce and body-nonce in
// sync. Static assets under /_next/static are still CDN-cached.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

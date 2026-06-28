/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // argon2 is a native module — keep it external to the server bundle.
  // (Next 14.2 uses experimental.serverComponentsExternalPackages; this was
  // renamed to the top-level serverExternalPackages in Next 15.)
  experimental: {
    serverComponentsExternalPackages: ["argon2"],
  },
};

module.exports = nextConfig;

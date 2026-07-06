/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Password hashing now uses hash-wasm (pure WebAssembly), so there's no
  // native module to keep external — it bundles and loads fine everywhere,
  // including serverless functions.
};

module.exports = nextConfig;

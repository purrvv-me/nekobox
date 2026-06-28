import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // Node 20+ provides global WebCrypto, atob/btoa, TextEncoder
    include: ["src/**/*.test.ts"],
  },
});

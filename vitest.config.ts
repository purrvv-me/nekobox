import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` is a Next build guard with no Node entry point; stub it so
      // server modules that import it (e.g. the mailer) can be unit-tested.
      "server-only": fileURLToPath(new URL("./test/empty-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node", // Node 20+ provides global WebCrypto, atob/btoa, TextEncoder
    include: ["src/**/*.test.ts"],
  },
});

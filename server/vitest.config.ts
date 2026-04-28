import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@paperclipai/shared": fileURLToPath(new URL("../packages/shared/dist/index.js", import.meta.url)),
      "@paperclipai/db": fileURLToPath(new URL("../packages/db/dist/index.js", import.meta.url)),
      "@paperclipai/adapter-utils": fileURLToPath(new URL("../packages/adapter-utils/dist/index.js", import.meta.url)),
      "@paperclipai/plugin-sdk": fileURLToPath(new URL("../packages/plugins/sdk/dist/index.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});

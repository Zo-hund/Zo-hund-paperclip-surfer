import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@paperclipai/shared",
        replacement: fileURLToPath(new URL("../packages/shared/dist/index.js", import.meta.url)),
      },
      {
        find: "@paperclipai/db",
        replacement: fileURLToPath(new URL("../packages/db/dist/index.js", import.meta.url)),
      },
      {
        find: /^@paperclipai\/adapter-utils\/(.+)$/,
        replacement: fileURLToPath(new URL("../packages/adapter-utils/dist/$1.js", import.meta.url)),
      },
      {
        find: "@paperclipai/adapter-utils",
        replacement: fileURLToPath(new URL("../packages/adapter-utils/dist/index.js", import.meta.url)),
      },
      {
        find: "@paperclipai/plugin-sdk",
        replacement: fileURLToPath(new URL("../packages/plugins/sdk/dist/index.js", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
  },
});

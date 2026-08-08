import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { iwsdkDev } from "@iwsdk/vite-plugin-dev";

export default defineConfig({
  plugins: [
    react(),
    iwsdkDev({
      emulator: { device: "metaQuest3" },
      ai: { mode: "agent" },
    }),
  ],
  resolve: {
    dedupe: ["three"],
  },
  optimizeDeps: {
    // Havok resolves its WASM beside the ESM module at runtime. Prebundling the
    // module moves that URL into .vite/deps without copying the binary.
    exclude: ["@babylonjs/havok"],
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          "three-engine": ["three/webgpu"],
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "qr-engine": ["qrcode"],
          "realtime-engine": ["@supabase/supabase-js"],
          "livekit-engine": ["livekit-client"],
        },
      },
    },
  },
});

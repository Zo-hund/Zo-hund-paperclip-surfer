import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^three$/, replacement: "three/webgpu" }],
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

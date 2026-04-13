import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      lexical: path.resolve(__dirname, "./node_modules/lexical/Lexical.mjs"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client"],
  },
  server: {
    allowedHosts: true,
  },
});

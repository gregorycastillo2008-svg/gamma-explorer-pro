import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_URL ?? "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    minify: "terser",
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    terserOptions: {
      compress: {
        drop_console: mode === "production",
        dead_code: true,
        unused: true,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
  },
}));

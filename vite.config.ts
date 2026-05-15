import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  base: process.env.VITE_BASE_URL ?? "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Bypass CORS for CBOE delayed data in local dev
      "/cboe-proxy": {
        target: "https://cdn.cboe.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cboe-proxy/, ""),
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules[\\/]plotly\.js/.test(id) || /node_modules[\\/]react-plotly/.test(id)) return 'plotly-vendor';
          if (/node_modules[\\/]three[\\/]/.test(id)) return 'three-vendor';
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) return 'supabase-vendor';
          if (/node_modules[\\/]framer-motion[\\/]/.test(id)) return 'motion-vendor';
          if (/node_modules[\\/]@radix-ui[\\/]/.test(id)) return 'radix-vendor';
          if (/node_modules[\\/]react-router/.test(id)) return 'react-router-vendor';
          if (/node_modules[\\/]react-dom[\\/]/.test(id)) return 'react-vendor';
          if (/node_modules[\\/]react[\\/]/.test(id)) return 'react-vendor';
          if (/node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query-vendor';
          if (/node_modules[\\/]/.test(id)) return 'vendor';
        },
      },
    },
  },
}));
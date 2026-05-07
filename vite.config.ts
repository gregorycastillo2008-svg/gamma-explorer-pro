import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
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
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    minify: "terser",
    sourcemap: false, // Deshabilita source maps en producción
    chunkSizeWarningLimit: 1000, // Aumentar límite de tamaño de chunk a 1MB
    terserOptions: {
      compress: {
        drop_console: mode === "production", // Remueve console.log en producción
        dead_code: true,
        unused: true,
      },
      mangle: true, // Ofusca nombres de variables
      format: {
        comments: false, // Remueve comentarios
      },
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Dividir vendor code
          if (id.includes("node_modules")) {
            if (id.includes("react")) {
              return "react-vendor";
            }
            if (id.includes("three")) {
              return "three-vendor";
            }
            if (id.includes("chart")) {
              return "chart-vendor";
            }
            return "vendor";
          }
        },
      },
    },
  },
}));

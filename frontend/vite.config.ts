import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": "http://localhost:3000",
      "/v1": "http://localhost:3000",
    },
    hmr: {
      host: "localhost",
      port: 5174,
    },
  },
  build: {
    outDir: "dist",
  },
})

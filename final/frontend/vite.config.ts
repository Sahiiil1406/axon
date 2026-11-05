import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "AXON_")
  const proxy = {
    "/api": {
      target: env.AXON_API_PROXY_TARGET || "http://127.0.0.1:8900",
      changeOrigin: true,
    },
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": resolve(import.meta.dirname, "./src") } },
    server: { proxy },
    preview: { proxy },
  }
})

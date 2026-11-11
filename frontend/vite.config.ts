
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

const backendEnvDir = fileURLToPath(new URL('../backend', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, backendEnvDir, '')

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (env.API_KEY) {
                proxyReq.setHeader('X-API-Key', env.API_KEY)
              }
            })
          },
        },
      },
    },
  }
})

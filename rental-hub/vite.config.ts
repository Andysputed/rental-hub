import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const apiBase = loadEnv(mode, process.cwd(), '').VITE_API_BASE_URL?.trim()
  if (mode === 'production') {
    if (!apiBase) throw new Error('Set VITE_API_BASE_URL to the deployed HTTPS API base URL before building.')
    let parsedApiBase: URL
    try {
      parsedApiBase = new URL(apiBase)
    } catch {
      throw new Error('VITE_API_BASE_URL must be an absolute URL.')
    }
    if (parsedApiBase.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsedApiBase.hostname)) {
      throw new Error('Production VITE_API_BASE_URL must use HTTPS unless explicitly pointed at localhost for local validation.')
    }
  }

  return {
    plugins: [tailwindcss(), react()],
    server: {
      host: '0.0.0.0',
      port: 5174,
      strictPort: true,
      allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
    },
  }
})

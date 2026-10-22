import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
host: '0.0.0.0',
port: 5174,
strictPort: true,
allowedHosts: [
'.ngrok-free.dev',
'.ngrok-free.app',
],
},

  
})

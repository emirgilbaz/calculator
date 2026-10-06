import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Where the Go backend runs in development.
// Override it if the backend uses another port, e.g. BACKEND_URL=http://localhost:8081
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
})
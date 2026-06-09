import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production: served at /ui/ by MES backbone (backend/server.js express.static)
// Dev: vite dev server at 5101 with /api proxy → 5100
export default defineConfig({
  plugins: [react()],
  // Relative base makes assets work whether the app is mounted at /ui/ (direct
  // backbone) or /mes-api/ui/ (via external nginx reverse proxy).
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5101,
    proxy: {
      '/api': {
        target: 'http://localhost:5100',
        changeOrigin: true,
      },
    },
  },
})

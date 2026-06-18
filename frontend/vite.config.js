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
      // my-api (backend ของเราเอง)
      '/api/wo':      { target: 'http://localhost:5099', changeOrigin: true },
      '/api/auth':    { target: 'http://localhost:5099', changeOrigin: true },
      '/api/bom':     { target: 'http://localhost:5099', changeOrigin: true },
      '/api/oba':     { target: 'http://localhost:5099', changeOrigin: true },
      '/api/qc':      { target: 'http://localhost:5099', changeOrigin: true },
      '/api/routing': { target: 'http://localhost:5099', changeOrigin: true },
      '/api/report':  { target: 'http://localhost:5099', changeOrigin: true },
      '/api/cr':      { target: 'http://localhost:5099', changeOrigin: true },
      '/api/rework':        { target: 'http://localhost:5099', changeOrigin: true },
      '/api/notifications': { target: 'http://localhost:5099', changeOrigin: true },
      '/api/scm':           { target: 'http://localhost:5099', changeOrigin: true },
      '/api/admin':         { target: 'http://localhost:5099', changeOrigin: true },
      '/api/jumbo':         { target: 'http://localhost:5099', changeOrigin: true },
      '/api/jig':           { target: 'http://localhost:5099', changeOrigin: true },
      '/api/inventory':     { target: 'http://localhost:5099', changeOrigin: true },
      '/api/production':    { target: 'http://localhost:5099', changeOrigin: true },
      '/api/pp':            { target: 'http://localhost:5099', changeOrigin: true },
      '/api/workflow':      { target: 'http://localhost:5099', changeOrigin: true },
      // Everything else → MES backbone (Docker)
      '/api': { target: 'http://localhost:5100', changeOrigin: true },
    },
  },
})

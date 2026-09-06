import { defineConfig } from 'vite'
import fs from 'node:fs'
import react from '@vitejs/plugin-react'

const httpsKeyPath = process.env.VITE_HTTPS_KEY
const httpsCertPath = process.env.VITE_HTTPS_CERT
const hmrHost = process.env.VITE_HMR_HOST || '192.168.123.35'
const https = httpsKeyPath && httpsCertPath && fs.existsSync(httpsKeyPath) && fs.existsSync(httpsCertPath)
  ? { key: fs.readFileSync(httpsKeyPath), cert: fs.readFileSync(httpsCertPath) }
  : undefined

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https,
    hmr: {
      host: hmrHost,
      protocol: https ? 'wss' : 'ws',
    },
  },
})

import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const certDir = path.resolve(process.cwd(), 'certs')
const certPath = path.join(certDir, 'localhost.pem')
const keyPath = path.join(certDir, 'localhost-key.pem')
const unityBuildVersion = new Date().toISOString().slice(0, 10)
const httpsConfig = fs.existsSync(certPath) && fs.existsSync(keyPath)
  ? {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    }
  : undefined

// https://vite.dev/config/
export default defineConfig({
  define: {
    'import.meta.env.VITE_UNITY_BUILD_VERSION': JSON.stringify(unityBuildVersion),
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    https: httpsConfig,
    allowedHosts: ['.local', 'shortcuts-reynolds-smoke-eyes.trycloudflare.com'],
  },
  preview: {
    host: '0.0.0.0',
    https: httpsConfig,
  },
})

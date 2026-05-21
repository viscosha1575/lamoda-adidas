import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const certDir = path.resolve(process.cwd(), 'certs')
const certPath = path.join(certDir, 'localhost.pem')
const keyPath = path.join(certDir, 'localhost-key.pem')

function padDatePart(value) {
  return String(value).padStart(2, '0')
}

function createUnityBuildVersion(date) {
  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join('') + '-' + [
    padDatePart(date.getUTCHours()),
    padDatePart(date.getUTCMinutes()),
    padDatePart(date.getUTCSeconds()),
  ].join('') + 'Z'
}

const unityBuildVersion = process.env.VITE_UNITY_BUILD_VERSION?.trim() || createUnityBuildVersion(new Date())
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

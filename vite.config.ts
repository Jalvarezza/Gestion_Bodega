import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

const certKey  = './192.168.0.144+2-key.pem'
const certFile = './192.168.0.144+2.pem'
const hasLocalCert = fs.existsSync(certKey) && fs.existsSync(certFile)

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    ...(hasLocalCert ? {
      https: {
        key:  fs.readFileSync(certKey),
        cert: fs.readFileSync(certFile),
      }
    } : {}),
    proxy: {
      '/api': {
        target:      'http://localhost:3000',
        changeOrigin: true,
      }
    }
  }
})
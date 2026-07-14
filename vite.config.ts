import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE_PATH 環境変数でbase pathを切り替え
// - 未設定 or 'relative': './' (Genspark/Cloudflare向け)
// - '/survivalroulette/': GitHub Pages向け
const basePath = process.env.VITE_BASE_PATH || './'

export default defineConfig({
  plugins: [react()],
  base: basePath,
  build: {
    outDir: process.env.VITE_OUT_DIR || 'dist',
  },
})

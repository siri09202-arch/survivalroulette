import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // ローカル/Genspark対応（相対パス）
  build: {
    outDir: 'dist',
  },
})

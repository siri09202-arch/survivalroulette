import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/survivalroulette/',  // GitHub Pages対応（リポジトリ名サブパス固定）
  build: {
    outDir: 'dist',
  },
})

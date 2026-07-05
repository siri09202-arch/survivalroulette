import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // GitHub Pages対応：相対パスで資産参照
  build: {
    outDir: 'dist',
  },
})

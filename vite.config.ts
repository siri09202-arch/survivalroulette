import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  define: {
    // ビルド時に環境変数 FIREBASE_CONFIG から注入、未設定なら undefined として扱う
    __firebase_config: process.env.FIREBASE_CONFIG
      ? JSON.stringify(process.env.FIREBASE_CONFIG)
      : 'undefined',
    __initial_auth_token: process.env.INITIAL_AUTH_TOKEN
      ? JSON.stringify(process.env.INITIAL_AUTH_TOKEN)
      : 'undefined',
    __app_id: process.env.APP_ID
      ? JSON.stringify(process.env.APP_ID)
      : JSON.stringify('survival-roulette'),
  },
})

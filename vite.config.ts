import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    // Proxy API calls to the FastAPI backend in dev so the frontend can
    // hit `/api/...` paths directly. Override the target with
    // VITE_API_PROXY_TARGET (e.g. when the backend is on another host).
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' + injectRegister: false means we own SW registration
      // in src/lib/pwa.ts so we can show a toast when an update is
      // ready instead of silently swapping the app while the user is
      // mid-edit.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '筑迹 Zhuji',
        short_name: '筑迹',
        description: '装修管家 — 单人业主版',
        theme_color: '#2563eb',
        background_color: '#fafafa',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          // `xlsx` is intentionally NOT listed here. Purchases.tsx
          // dynamic-imports it on first "导出 Excel" click; letting
          // rollup auto-emit it as its own async chunk keeps the
          // initial bundle small (xlsx is ~6 MB of source).
          dexie: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
})

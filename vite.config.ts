import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
          xlsx: ['xlsx'],
          dexie: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
})

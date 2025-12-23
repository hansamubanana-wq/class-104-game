import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: '104 名前当てタイムアタック',
        short_name: '104アタック',
        description: '1年104組の名前当てゲーム',
        theme_color: '#f6d365', // 背景色に合わせた黄色
        background_color: '#f6d365',
        display: 'standalone', // これでブラウザのバーが消える
        orientation: 'portrait', // 縦画面固定
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
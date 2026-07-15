import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/favicon-16.png', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Nokfi — Análisis financiero para pymes',
        short_name: 'Nokfi',
        description: 'Diagnóstico financiero y análisis de datos con IA para autónomos y pymes',
        theme_color: '#1456A2',
        background_color: '#0F0F0F',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/app/home',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
        ]
      },
      workbox: {
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }
        ]
      }
    })
  ],
  server: { port: 5173, host: true }
});

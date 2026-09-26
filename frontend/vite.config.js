import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// §2.2 (sesión 4): versión visible en la app (Configuración, Ayuda y el
// email de soporte) = hash corto de git + fecha de build. Responde a
// "¿qué versión ves?" en soporte.
function appVersion() {
  let hash = 'dev';
  try { hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* sin git */ }
  const d = new Date();
  const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${hash}-${date}`;
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion())
  },
  build: {
    rollupOptions: {
      output: {
        // El worker de pdf.js sale como .mjs y Nginx (mime.types de Debian) lo
        // sirve como application/octet-stream → con nosniff el navegador NO lo
        // ejecuta y los PDF no se leen. Se emite con extensión .js.
        assetFileNames: (info) => (/\.mjs$/.test(info.name || '') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]'),
        // C7: librerías pesadas en chunks con nombre propio (se cargan bajo
        // demanda y las de exportación no se precachean en la PWA).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](docx|pptxgenjs|jszip)[\\/]/.test(id)) return 'vendor-export';
          if (/[\\/](jspdf|jspdf-autotable|html2canvas|canvg|dompurify)[\\/]/.test(id)) return 'vendor-jspdf';
          if (/[\\/]pdfjs-dist[\\/]/.test(id)) return 'vendor-pdfjs';
          if (/[\\/]xlsx[\\/]/.test(id)) return 'vendor-xlsx';
          if (/[\\/](recharts|d3-[a-z]+|victory-vendor)[\\/]/.test(id)) return 'vendor-charts';
          return undefined;
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      // §2.1: 'prompt' + <UpdatePrompt/> (antes 'autoUpdate' dejaba la pestaña
      // con el bundle viejo hasta cerrar todas las pestañas).
      registerType: 'prompt',
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
        globIgnores: ['**/vendor-export-*.js', '**/vendor-jspdf-*.js', '**/pdf.worker*', '**/fonts/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
          // Chunks cargados bajo demanda: se cachean al usarse (nombres con hash → inmutables).
          { urlPattern: ({ url }) => url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/'), handler: 'CacheFirst',
            options: { cacheName: 'nokfi-assets', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 60 } } }
        ]
      }
    })
  ],
  server: { port: 5173, host: true }
});

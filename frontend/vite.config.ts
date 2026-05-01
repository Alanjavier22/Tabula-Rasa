import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Finance Local-First',
        short_name: 'Finance',
        description: 'Personal Finance App with Local-First Sync',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        // icons: [
        //   {
        //     src: 'pwa-192x192.png',
        //     sizes: '192x192',
        //     type: 'image/png',
        //     purpose: 'any maskable'
        //   },
        //   {
        //     src: 'pwa-512x512.png',
        //     sizes: '512x512',
        //     type: 'image/png',
        //     purpose: 'any maskable'
        //   }
        // ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // FASE 4: API Mutations - NetworkOnly to prevent cache interference
          // POST/PUT/PATCH/DELETE must NEVER be cached - strict network only
          {
            urlPattern: ({ request }) => {
              const url = new URL(request.url);
              // Match API endpoints (backend typically on :8001 or configured URL)
              const isApiEndpoint = url.pathname.startsWith('/api') ||
                                   url.port === '8001' ||
                                   url.hostname.includes('localhost');
              const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
              return isApiEndpoint && isMutation;
            },
            handler: 'NetworkOnly',
            options: {
              cacheName: 'api-mutations-v1'
            }
          },
          // FASE 4: API Reads - NetworkFirst for offline support
          {
            urlPattern: ({ request }) => {
              const url = new URL(request.url);
              // Solo cachear si es el puerto del backend y es un GET
              return url.port === '8001' && request.method === 'GET';
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-reads-v1',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 5 * 60 // 5 minutes - short cache for fresh data
              }
            }
          },
          {
            urlPattern: /^https?.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'offline-cache-v3',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              }
            }
          },
          {
            urlPattern: /\.(?:js|css|png|jpg|jpeg|svg|ico|woff2)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets-v3',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
              }
            }
          },
          // FASE 5: Aggressive caching for Recharts and decimal.js-light
          {
            urlPattern: /recharts|decimal\.js-light/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'charting-libs-v3',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              }
            }
          },
          // FASE 8: Cache framer-motion for smooth transitions
          {
            urlPattern: /framer-motion/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'animation-libs-v3',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              }
            }
          }
        ]
      }
    })
  ],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Las rutas de la SPA usan los mismos nombres que algunos recursos de la API.
// El límite final evita que una recarga de `/categories` (por ejemplo) se
// proxifique al backend y conserva la navegación del frontend en Vite.
const API_PROXY_TARGET = 'http://localhost:8001'
const API_PROXY_PATHS = [
  '/api',
  '^/transactions/',
  '^/categories/',
  '^/accounts/',
  '^/budgets/',
  '^/goals/',
  '^/reminders/',
  '^/subscriptions/',
  '/statements',
  '/ious',
  '/deferred',
  '/metrics',
  '/alerts',
  '/backup',
  '^/fiscal/',
  '/intelligence',
  '^/snapshots/',
  '/ai-assistant',
  '/auth',
  '/maintenance',
] as const

const proxy = Object.fromEntries(
  API_PROXY_PATHS.map((route) => [route, { target: API_PROXY_TARGET, changeOrigin: true }]),
)

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  plugins: [
    react(),
  ],
  server: {
    proxy,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) {
              return 'vendor-recharts';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            return 'vendor';
          }
        }
      }
    }
  }
})

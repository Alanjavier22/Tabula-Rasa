import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/transactions': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/categories': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/accounts': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/budgets': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/goals': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/reminders': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/subscriptions': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/statements': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/ious': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/deferred': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/metrics': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/alerts': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/backup': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/fiscal': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/intelligence': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/snapshots': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/ai-assistant': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/maintenance': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    }
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

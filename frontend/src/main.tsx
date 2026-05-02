import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { phoenixHardReset } from './db/db'

registerSW({ immediate: true })

/**
 * Thin Client: IndexedDB Cleanup
 * Deletes the old IndexedDB database to remove zombie data from previous architecture.
 * In Thin Client mode, all data is fetched from backend API on demand.
 */
async function cleanupOldIndexedDB(): Promise<void> {
  const DB_NAME = 'FinanceLocalFirstDB';
  const CLEANUP_KEY = 'indexeddb_cleanup_done';

  // Check if cleanup already done
  if (localStorage.getItem(CLEANUP_KEY) === 'true') {
    return;
  }

  try {
    console.log('[Thin Client] Cleaning up old IndexedDB database...');
    
    // Delete the old IndexedDB database
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    
    deleteRequest.onsuccess = () => {
      console.log('[Thin Client] Old IndexedDB database deleted successfully');
      localStorage.setItem(CLEANUP_KEY, 'true');
    };
    
    deleteRequest.onerror = () => {
      console.error('[Thin Client] Failed to delete old IndexedDB database');
    };
    
    deleteRequest.onblocked = () => {
      console.warn('[Thin Client] IndexedDB deletion blocked - other tabs may have it open');
    };
  } catch (error) {
    console.error('[Thin Client] Error during IndexedDB cleanup:', error);
  }
}

// Run cleanup on app initialization
cleanupOldIndexedDB();

// FASE PHOENIX GLOBAL: Global Promise Interceptor for unhandled Dexie rejections
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason?.name?.toLowerCase().includes('dexie') || 
      reason?.stack?.toLowerCase().includes('dexie') ||
      reason?.message?.toLowerCase().includes('dexie') ||
      reason?.constructor?.name === 'DexieError') {
    console.error('[Phoenix Global Catch] Capturado error de Dexie no manejado:', reason);
    // Prevent default browser error logging
    event.preventDefault();
    // Trigger Phoenix Hard Reset instead of reload to break loop
    console.warn('[Phoenix Global Catch] Ejecutando Phoenix Hard Reset para corregir esquema');
    phoenixHardReset();
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      // FASE PHOENIX AGGRESSIVE: Atrapa-todo Dexie - nombre, stack, mensaje
      throwOnError: (error: any) => {
        const isDexie = error?.name?.toLowerCase().includes('dexie') ||
                        error?.stack?.toLowerCase().includes('dexie') ||
                        error?.message?.toLowerCase().includes('dexie') ||
                        error?.constructor?.name === 'DexieError';
        return !!isDexie;
      },
    },
    mutations: {
      // FASE PHOENIX AGGRESSIVE: Atrapa-todo Dexie - nombre, stack, mensaje
      throwOnError: (error: any) => {
        const isDexie = error?.name?.toLowerCase().includes('dexie') ||
                        error?.stack?.toLowerCase().includes('dexie') ||
                        error?.message?.toLowerCase().includes('dexie') ||
                        error?.constructor?.name === 'DexieError';
        return !!isDexie;
      }
    }
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

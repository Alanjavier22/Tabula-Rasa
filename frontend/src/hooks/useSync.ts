import { useState, useCallback, useEffect } from 'react';
import { db } from '../db/db';
import { syncAPI } from '../services/api';
import { getTokenKey } from '../services/api';

const TABLES_TO_SYNC = [
  'config',
  'exchange_rates',
  'categories',
  'accounts',
  'transactions',
  'transaction_splits',
  'credit_card_statements',
  'debt_shares',
  'ious',
  'budgets',
  'goals',
  'reminders',
  'subscriptions',
  'vehicles',
  'fuel_logs',
  'maintenance_logs',
  'net_worth_snapshots'
];

const BACKGROUND_SYNC_BLOCK_SIZE = 1000;
const RECENT_DAYS = 90;

export const useSync = () => {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [conflictsResolved, setConflictsResolved] = useState<number>(0);

  // Track browser online/offline status
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Load initial sync metadata on mount
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const metadata = await db.sync_metadata.get('last_sync_timestamp');
        if (metadata && metadata.value) {
          setLastSyncDate(metadata.value);
        }
        const conflicts = await db.sync_metadata.get('conflicts_resolved');
        if (conflicts && conflicts.value) {
          setConflictsResolved(Number(conflicts.value) || 0);
        }
      } catch (err) {
        console.error("Error reading sync metadata on mount:", err);
      }
    };
    loadMetadata();
  }, []);

  const sync = useCallback(async () => {
    if (isSyncing) return;

    try {
      setIsSyncing(true);
      setError(null);

      // --- 1. Extracción de 'Dirty Data' (Fase de Subida) ---
      let lastSyncTimestamp: string | null = null;
      const metadata = await db.sync_metadata.get('last_sync_timestamp');
      if (metadata && metadata.value) {
        lastSyncTimestamp = metadata.value;
      }

      const changes: Record<string, any[]> = {};
      
      // Consultar paralelamente todas las tablas para acelerar
      const promises = TABLES_TO_SYNC.map(async (tableName) => {
        const table = db.table(tableName);
        let dirtyRecords = [];
        
        if (lastSyncTimestamp) {
          // Si hay una fecha anterior, solo traemos lo que cambió después de esa fecha
          dirtyRecords = await table.where('updated_at').above(lastSyncTimestamp).toArray();
        } else {
          // Si nunca se ha sincronizado, subimos todo
          dirtyRecords = await table.toArray();
        }
        
        if (dirtyRecords.length > 0) {
          changes[tableName] = dirtyRecords;
        }
      });

      await Promise.all(promises);

      const payload = {
        last_sync_timestamp: lastSyncTimestamp,
        changes: changes,
        // Cold start optimization: request recent data first
        cold_start_mode: !lastSyncTimestamp,
        recent_days: RECENT_DAYS
      };

      // --- 2. Interacción de Red ---
      const response = await syncAPI.syncChanges(payload);
      
      const serverTimestamp = response.data.server_timestamp;
      const incomingChanges = response.data.changes;

      // --- 3. Fusión de Datos y UPSERT Atómico (Fase de Bajada) ---
      // Si esta transacción falla o la app se cierra inesperadamente, 
      // IndexedDB hace un rollback automático (Atomicidad garantizada).
      let sessionConflicts = 0;

      await db.transaction('rw', db.tables, async () => {
        // Iteramos sobre las tablas que el backend mandó de regreso
        for (const tableName of Object.keys(incomingChanges)) {
          if (TABLES_TO_SYNC.includes(tableName)) {
            const table = db.table(tableName);
            const records = incomingChanges[tableName];
            
            // table.bulkPut hace un UPSERT masivo basado en la llave primaria (&id)
            if (records && records.length > 0) {
              // Count LWW conflicts: records that we also uploaded (both sides modified)
              if (changes[tableName]) {
                const uploadedIds = new Set(changes[tableName].map((r: any) => r.id));
                sessionConflicts += records.filter((r: any) => uploadedIds.has(r.id)).length;
              }
              await table.bulkPut(records);
            }
          }
        }

        // Persist conflict counter (cumulative)
        const prev = await db.sync_metadata.get('conflicts_resolved');
        const newTotal = (Number(prev?.value) || 0) + sessionConflicts;
        await db.sync_metadata.put({ key: 'conflicts_resolved', value: newTotal });

        // Actualizamos el last_sync_timestamp localmente
        await db.sync_metadata.put({ 
          key: 'last_sync_timestamp', 
          value: serverTimestamp 
        });
      });

      setLastSyncDate(serverTimestamp);
      if (sessionConflicts > 0) {
        setConflictsResolved(prev => prev + sessionConflicts);
      }

      // Trigger background sync for historical data if cold start
      if (!lastSyncTimestamp && response.data.has_more_historical) {
        setTimeout(() => syncHistoricalBackground(), 1000);
      }

    } catch (err: any) {
      console.error("Error en la sincronización LWW:", err);
      // Se detecta si es error de red (no hay wifi, servidor caído)
      if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
         setError("No hay conexión con el servidor local. Sincronización pausada.");
      } else {
         setError(err.response?.data?.detail || "Error desconocido al sincronizar.");
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  /**
   * Background sync for historical data in blocks
   * Runs after initial recent sync completes
   */
  const syncHistoricalBackground = useCallback(async () => {
    try {
      const metadata = await db.sync_metadata.get('last_sync_timestamp');
      if (!metadata || !metadata.value) return;

      const lastSyncTimestamp = metadata.value;
      let hasMore = true;
      let offset = 0;

      while (hasMore) {
        const response = await syncAPI.syncChanges({
          last_sync_timestamp: lastSyncTimestamp,
          changes: {},
          historical_mode: true,
          offset,
          limit: BACKGROUND_SYNC_BLOCK_SIZE
        });

        const incomingChanges = response.data.changes;

        await db.transaction('rw', db.tables, async () => {
          for (const tableName of Object.keys(incomingChanges)) {
            if (TABLES_TO_SYNC.includes(tableName)) {
              const table = db.table(tableName);
              const records = incomingChanges[tableName];
              if (records && records.length > 0) {
                await table.bulkPut(records);
              }
            }
          }
        });

        hasMore = response.data.has_more;
        offset += BACKGROUND_SYNC_BLOCK_SIZE;

        // Small delay between blocks to avoid blocking
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('[useSync] Background historical sync error:', error);
    }
  }, []);

  // Auto-sync on mount when user is authenticated and online
  useEffect(() => {
    const tokenKey = getTokenKey();
    const token = localStorage.getItem(tokenKey);
    if (token && isOnline && !lastSyncDate) {
      // First time with token - trigger initial sync
      sync();
    }
  }, [isOnline, lastSyncDate, sync]);


  return {
    sync,
    isSyncing,
    lastSyncDate,
    error,
    isOnline,
    conflictsResolved
  };
};

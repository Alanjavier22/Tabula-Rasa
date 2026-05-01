import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudOff, Cloud, RefreshCw, CheckCircle2 } from 'lucide-react';
import { syncCoordinator } from '../services/SyncCoordinator';
import { useSync } from '../hooks/useSync';

export const SyncStatusIndicator: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  // FIX: Removed historicalSyncStatus - not returned by useSync hook
  useSync();

  // Subscribe to SyncCoordinator state changes (observer pattern)
  useEffect(() => {
    const unsubscribe = syncCoordinator.subscribe((syncing: boolean) => {
      setIsSyncing(syncing);
    });

    // Set initial state
    setIsSyncing(syncCoordinator.getIsSyncing());

    return unsubscribe;
  }, []);

  // Listen to online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setError(null);
      syncCoordinator.processQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen to localMutation events
  useEffect(() => {
    const handleLocalMutation = () => {
      if (isOnline) {
        syncCoordinator.processQueue();
      }
    };

    window.addEventListener('localMutation', handleLocalMutation);
    return () => {
      window.removeEventListener('localMutation', handleLocalMutation);
    };
  }, [isOnline]);

  return (
    <div className="flex items-center justify-center p-2">
      <AnimatePresence mode="wait">
        {!isOnline ? (
          <motion.div
            key="offline"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2 text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/30"
            title="Modo Offline: Puedes seguir registrando gastos. Se sincronizarán automáticamente al reconectar."
          >
            <CloudOff className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">Offline</span>
          </motion.div>
        ) : isSyncing ? (
          <motion.div
            key="syncing"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2 text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/30"
            title="Sincronizando..."
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-xs font-medium hidden sm:inline">Sincronizando...</span>
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2 text-red-400 bg-red-500/10 px-3 py-1.5 rounded-full border border-red-500/30 cursor-pointer hover:bg-red-500/20 transition-colors"
            onClick={() => syncCoordinator.processQueue()}
            title={error}
          >
            <CloudOff className="w-4 h-4" />
            <span className="text-xs font-medium hidden sm:inline">Error de conexión</span>
          </motion.div>
        ) : (
          <motion.div
            key="synced"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/20 transition-colors"
            onClick={() => syncCoordinator.processQueue()}
            title="Sincronizado"
          >
            <Cloud className="w-4 h-4" />
            <CheckCircle2 className="w-3 h-3 absolute ml-3 mt-3 bg-slate-900 rounded-full" />
            <span className="text-xs font-medium hidden sm:inline">Sincronizado</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

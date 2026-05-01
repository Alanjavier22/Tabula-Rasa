/**
 * IntegrityStatus Component - FASE 7
 * Shows a subtle indicator when there are stale snapshots that need reconciliation
 */
import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { db } from '../db/db';

export const IntegrityStatus = () => {
  const [staleCount, setStaleCount] = useState(0);
  const [calculating, setCalculating] = useState(true);

  useEffect(() => {
    const checkStaleSnapshots = async () => {
      try {
        setCalculating(true);
        // @ts-ignore
        const count = await db.net_worth_snapshots.where('is_stale').equals(true).count();
        setStaleCount(count);
      } catch (error) {
        console.error('[IntegrityStatus] Error checking stale snapshots:', error);
      } finally {
        setCalculating(false);
      }
    };

    checkStaleSnapshots();

    // Listen for sync events to refresh
    const handleSync = () => checkStaleSnapshots();
    window.addEventListener('localMutation', handleSync);
    return () => window.removeEventListener('localMutation', handleSync);
  }, []);

  // Don't show anything if no stale snapshots
  if (staleCount === 0 && !calculating) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {calculating ? (
        <div className="flex items-center gap-1 text-amber-400">
          <AlertCircle className="w-4 h-4 animate-pulse" />
          <span>Calculando integridad...</span>
        </div>
      ) : staleCount > 0 ? (
        <div className="flex items-center gap-1 text-amber-400" title={`${staleCount} snapshots obsoletos necesitan reconciliación`}>
          <AlertCircle className="w-4 h-4" />
          <span>{staleCount} stale</span>
        </div>
      ) : null}
    </div>
  );
};

/**
 * IntegrityBadge - FASE 5: Heartbeat status indicator
 * FASE 6: Reactive to pending mutations
 * Verde = Inmune, Amarillo = Sincronizando, Rojo = Error Esquema
 */

import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { db } from '../../db/db';
import { useLiveQuery } from 'dexie-react-hooks';

type IntegrityStatus = 'immune' | 'syncing' | 'error';

interface IntegrityBadgeProps {
  status?: IntegrityStatus;
  lastCheck?: string;
}

export const IntegrityBadge: React.FC<IntegrityBadgeProps> = ({
  status = 'immune',
  lastCheck,
}) => {
  // FASE 7: Use useLiveQuery for reactive counting from sync_queue
  const pendingCount = useLiveQuery(() => db.sync_queue.count()) || 0;
  
  const [currentStatus, setCurrentStatus] = useState<IntegrityStatus>(status);

  // Update status based on pending count (reactive)
  useEffect(() => {
    if (pendingCount > 0) {
      setCurrentStatus('syncing');
    } else {
      setCurrentStatus('immune');
    }
  }, [pendingCount]);

  const config = {
    immune: {
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-100',
      label: 'Inmune',
    },
    syncing: {
      icon: AlertTriangle,
      color: 'text-yellow-600',
      bg: 'bg-yellow-100',
      label: `Sincronizando (${pendingCount})`,
    },
    error: {
      icon: Shield,
      color: 'text-red-600',
      bg: 'bg-red-100',
      label: 'Error Esquema',
    },
  }[currentStatus];

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bg}`}>
      <Icon className={`w-4 h-4 ${config.color}`} />
      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
      {lastCheck && (
        <span className="text-xs text-gray-500">· {new Date(lastCheck).toLocaleTimeString()}</span>
      )}
    </div>
  );
};

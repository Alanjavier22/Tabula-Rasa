/**
 * IntegrityBadge - Heartbeat status indicator
 * Thin Client: Always shows immune status (no sync queue)
 * Verde = Inmune, Rojo = Error
 */

import React from 'react';
import { Shield, CheckCircle } from 'lucide-react';

type IntegrityStatus = 'immune' | 'error';

interface IntegrityBadgeProps {
  status?: IntegrityStatus;
  lastCheck?: string;
}

export const IntegrityBadge: React.FC<IntegrityBadgeProps> = ({
  status = 'immune',
  lastCheck,
}) => {
  const config = {
    immune: {
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-100',
      label: 'Inmune',
    },
    error: {
      icon: Shield,
      color: 'text-red-600',
      bg: 'bg-red-100',
      label: 'Error Esquema',
    },
  }[status];

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

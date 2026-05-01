/**
 * Health Indicator Component
 * Visual indicator of data integrity status
 * Green: All hashes valid + accounting equation matches
 * Red: Hash integrity failures detected
 * Warning: Accounting equation mismatch (Cash + Assets - Liabilities != Net Worth)
 */

import { useState, useEffect } from 'react';
import { integrityService, type IntegrityCheckResult } from '../services/IntegrityService';

export function HealthIndicator() {
  const [status, setStatus] = useState<IntegrityCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      setLoading(true);
      // Try cached result first
      const cached = integrityService.getCachedResult();
      if (cached) {
        setStatus(cached);
        setLoading(false);
        return;
      }

      // Run integrity check if needed
      if (integrityService.needsCheck()) {
        const result = await integrityService.verifyDatabaseIntegrity();
        setStatus(result);
      } else {
        setStatus(integrityService.getCachedResult());
      }
      setLoading(false);
    };

    loadStatus();

    // Schedule background check
    integrityService.scheduleBackgroundCheck();
  }, []);

  if (loading || !status) {
    return (
      <div className="flex items-center space-x-2 text-gray-400">
        <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
        <span className="text-xs">Verificando integridad...</span>
      </div>
    );
  }

  const getStatusColor = () => {
    if (status.status === 'critical') return 'bg-red-500';
    if (status.status === 'warning') return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (status.status === 'critical') return 'Error de Integridad';
    if (status.status === 'warning') return 'Advertencia Contable';
    return 'Saludable';
  };

  const getStatusMessage = () => {
    if (status.hasHashFailures) {
      return `${status.hashFailures} transacciones con hash inválido`;
    }
    if (!status.accountingEquationValid && status.accountingDifferenceCents > 0) {
      const diffDollars = (status.accountingDifferenceCents / 100).toFixed(2);
      return `Diferencia contable: $${diffDollars}`;
    }
    return 'Todos los sistemas operativos';
  };

  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
        <span className={`text-xs font-medium ${
          status.status === 'critical' ? 'text-red-700' :
          status.status === 'warning' ? 'text-yellow-700' :
          'text-green-700'
        }`}>
          {getStatusText()}
        </span>
      </div>
      <span className="text-xs text-gray-600">
        {getStatusMessage()}
      </span>
      {status.totalChecked > 0 && (
        <span className="text-xs text-gray-400">
          ({status.totalChecked} registros verificados)
        </span>
      )}
    </div>
  );
}

/**
 * Hook for health status
 */
export function useHealthStatus() {
  const [status, setStatus] = useState<IntegrityCheckResult | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      const cached = integrityService.getCachedResult();
      if (cached) {
        setStatus(cached);
        return;
      }

      if (integrityService.needsCheck()) {
        const result = await integrityService.verifyDatabaseIntegrity();
        setStatus(result);
      } else {
        setStatus(integrityService.getCachedResult());
      }
    };

    loadStatus();
  }, []);

  return status;
}

import { useState } from 'react';
import { X, ArrowLeft, ArrowRight } from 'lucide-react';
import type { SyncConflictEntry } from '../db/db';
import { db } from '../db/db';
import { resolveConflict } from '../services/conflictUtils';
import { localUpdate } from '../services/api';
import { generateTransactionHash } from '../utils/crypto';
import { formatMoney } from '../utils/money';

interface ConflictResolutionModalProps {
  conflict: SyncConflictEntry;
  onClose: () => void;
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const ConflictResolutionModal = ({ conflict, onClose }: ConflictResolutionModalProps) => {
  const [isResolving, setIsResolving] = useState(false);

  const handleKeepLocal = async () => {
    setIsResolving(true);
    try {
      // 1. Update local_data with server's version (for backend acceptance)
      const localData = { ...conflict.local_data };
      if (conflict.server_data?.version) {
        localData.version = conflict.server_data.version;
      }

      // 2. Regenerate SHA-256 hash if transaction
      if (conflict.table_name === 'transactions' && localData.date && localData.amount && localData.description) {
        localData.hash = await generateTransactionHash(
          localData.date,
          localData.amount,
          localData.description,
          localData.account_id || ''
        );
      }

      // 3. Re-queue with localUpdate (triggers sync_queue)
      await localUpdate(conflict.table_name, conflict.record_id, localData);

      // 4. Mark conflict as resolved
      await resolveConflict(conflict.id);

      // 5. Clear needs_review flag
      // @ts-ignore
      await db.table(conflict.table_name).update(conflict.record_id, {
        needs_review: false,
      });

      console.log(`[ConflictResolution] Kept local change for ${conflict.table_name}:${conflict.record_id}`);
      onClose();
    } catch (error) {
      console.error('[ConflictResolution] Failed to keep local change:', error);
      alert('Error al mantener el cambio local. Por favor intenta nuevamente.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleAcceptServer = async () => {
    setIsResolving(true);
    try {
      // 1. Mark conflict as resolved
      await resolveConflict(conflict.id);

      // 2. Clear needs_review flag (server data already applied in FASE 8.1)
      // @ts-ignore
      await db.table(conflict.table_name).update(conflict.record_id, {
        needs_review: false,
      });

      console.log(`[ConflictResolution] Accepted server version for ${conflict.table_name}:${conflict.record_id}`);
      onClose();
    } catch (error) {
      console.error('[ConflictResolution] Failed to accept server version:', error);
      alert('Error al aceptar la versión del servidor. Por favor intenta nuevamente.');
    } finally {
      setIsResolving(false);
    }
  };

  const renderField = (label: string, localValue: any, serverValue: any) => {
    const isDifferent = JSON.stringify(localValue) !== JSON.stringify(serverValue);
    
    return (
      <div className={`p-3 rounded-lg ${isDifferent ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-800'}`}>
        <p className="text-xs font-medium text-slate-400 mb-2">{label}</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">Tu versión</p>
            <p className="text-sm font-medium text-white">
              {localValue !== undefined ? localValue.toString() : '-'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Servidor</p>
            <p className="text-sm font-medium text-slate-300">
              {serverValue !== undefined ? serverValue.toString() : '-'}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Resolución de Conflicto</h2>
              <p className="text-sm text-slate-400">
                {conflict.table_name} - {conflict.record_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            disabled={isResolving}
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Side-by-Side Comparison */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Local Version */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                <h3 className="text-lg font-bold text-white">Tu Versión</h3>
              </div>
              <div className="space-y-3">
                {conflict.local_data?.date && (
                  <div>
                    <p className="text-xs text-slate-500">Fecha</p>
                    <p className="text-sm text-white">{formatDate(conflict.local_data.date)}</p>
                  </div>
                )}
                {conflict.local_data?.description && (
                  <div>
                    <p className="text-xs text-slate-500">Descripción</p>
                    <p className="text-sm text-white">{conflict.local_data.description}</p>
                  </div>
                )}
                {conflict.local_data?.amount !== undefined && (
                  <div>
                    <p className="text-xs text-slate-500">Monto</p>
                    <p className="text-sm text-white">${formatMoney(conflict.local_data.amount)} USD</p>
                  </div>
                )}
                {conflict.local_data?.version && (
                  <div>
                    <p className="text-xs text-slate-500">Versión</p>
                    <p className="text-sm text-white">{conflict.local_data.version}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Server Version */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                <h3 className="text-lg font-bold text-white">Versión del Servidor</h3>
              </div>
              <div className="space-y-3">
                {conflict.server_data?.date && (
                  <div>
                    <p className="text-xs text-slate-500">Fecha</p>
                    <p className="text-sm text-slate-300">{formatDate(conflict.server_data.date)}</p>
                  </div>
                )}
                {conflict.server_data?.description && (
                  <div>
                    <p className="text-xs text-slate-500">Descripción</p>
                    <p className="text-sm text-slate-300">{conflict.server_data.description}</p>
                  </div>
                )}
                {conflict.server_data?.amount !== undefined && (
                  <div>
                    <p className="text-xs text-slate-500">Monto</p>
                    <p className="text-sm text-slate-300">${formatMoney(conflict.server_data.amount)} USD</p>
                  </div>
                )}
                {conflict.server_data?.version && (
                  <div>
                    <p className="text-xs text-slate-500">Versión</p>
                    <p className="text-sm text-slate-300">{conflict.server_data.version}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Field-by-Field Comparison */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400">Comparación Detallada</h3>
            {conflict.local_data?.date && renderField('Fecha', conflict.local_data.date, conflict.server_data?.date)}
            {conflict.local_data?.description && renderField('Descripción', conflict.local_data.description, conflict.server_data?.description)}
            {conflict.local_data?.amount !== undefined && renderField('Monto (centavos)', conflict.local_data.amount, conflict.server_data?.amount)}
            {conflict.local_data?.version && renderField('Versión', conflict.local_data.version, conflict.server_data?.version)}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 p-6 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={handleKeepLocal}
            disabled={isResolving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            Mantener mi cambio local
          </button>
          <button
            onClick={handleAcceptServer}
            disabled={isResolving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRight className="w-4 h-4" />
            Aceptar versión del servidor
          </button>
        </div>
      </div>
    </div>
  );
};

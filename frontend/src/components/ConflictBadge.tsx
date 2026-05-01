import { useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { SyncConflictEntry } from '../db/db';
import { ConflictResolutionModal } from './ConflictResolutionModal';

export const ConflictBadge = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Monitor sync_conflicts table for unresolved conflicts
  const conflicts = useLiveQuery(
    () => db.sync_conflicts
      .where('resolved')
      .equals(0)
      .toArray() as Promise<SyncConflictEntry[]>
  );

  const conflictCount = conflicts?.length || 0;

  if (conflictCount === 0) {
    return null;
  }

  return (
    <>
      {/* Alert Icon in Topbar/Sidebar */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 bg-amber-500/20 rounded-lg hover:bg-amber-500/30 transition-colors"
        title={`${conflictCount} conflicto(s) pendiente(s)`}
      >
        <TriangleAlert className="w-5 h-5 text-amber-400" />
        {conflictCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {conflictCount}
          </span>
        )}
      </button>

      {/* Conflict List Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <TriangleAlert className="w-6 h-6 text-amber-400" />
                <h2 className="text-xl font-bold text-white">
                  Conflictos Pendientes ({conflictCount})
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Conflict List */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {conflicts && conflicts.length > 0 ? (
                <div className="space-y-3">
                  {conflicts.map((conflict) => (
                    <ConflictItem key={conflict.id} conflict={conflict} />
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-8">
                  No hay conflictos pendientes
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const ConflictItem = ({ conflict }: { conflict: SyncConflictEntry }) => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-750 transition-colors text-left"
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-white">
              {conflict.table_name}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              ID: {conflict.record_id}
            </p>
          </div>
          <span className="text-xs text-amber-400 bg-amber-500/20 px-2 py-1 rounded-full">
            Pendiente
          </span>
        </div>
      </button>

      {showModal && (
        <ConflictResolutionModal
          conflict={conflict}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

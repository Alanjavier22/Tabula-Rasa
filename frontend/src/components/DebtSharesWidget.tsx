import { useState } from 'react';
import { statementsAPI } from '../services/api';
import type { CreditCardStatement, DebtShare } from '../types';
import { Users, DollarSign, CheckCircle, X, Plus } from 'lucide-react';
import Toast from './Toast';

const DebtSharesWidget = ({ statements }: { statements: CreditCardStatement[] }) => {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showAddModal, setShowAddModal] = useState<{ isOpen: boolean; statementId: string | null }>({ isOpen: false, statementId: null });
  const [formData, setFormData] = useState({ person_name: '', amount: '', description: '', status: 'pending' });
  const [adding, setAdding] = useState(false);

  // Collect all debt shares from all statements
  const allDebtShares: Array<DebtShare & { statement: CreditCardStatement }> = [];
  statements.forEach(stmt => {
    if (stmt.debt_shares && stmt.debt_shares.length > 0) {
      stmt.debt_shares.forEach(ds => {
        allDebtShares.push({ ...ds, statement: stmt });
      });
    }
  });

  const pendingShares = allDebtShares.filter(ds => ds.status === 'pending');
  const totalPending = pendingShares.reduce((sum, ds) => sum + ds.amount, 0);

  // Show widget if there are statements (for credit cards) or existing debt shares
  if (statements.length === 0 && allDebtShares.length === 0) {
    return null;
  }

  const handleAddDebtShare = () => {
    if (statements.length === 0) {
      setToast({ message: 'Primero crea un estado de cuenta para tu tarjeta de crédito', type: 'error' });
      return;
    }
    // Open modal for first statement
    setShowAddModal({ isOpen: true, statementId: statements[0].id });
  };

  const handleAddShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddModal.statementId) return;

    setAdding(true);
    try {
      await statementsAPI.addDebtShare(showAddModal.statementId, {
        person_name: formData.person_name,
        amount: parseInt(formData.amount) * 100, // Convert to cents
        description: formData.description || undefined,
        status: formData.status,
      });
      setToast({ message: 'Deuda compartida agregada', type: 'success' });
      setShowAddModal({ isOpen: false, statementId: null });
      setFormData({ person_name: '', amount: '', description: '', status: 'pending' });
      // Refresh statements
      window.location.reload();
    } catch (error: any) {
      console.error('Error adding debt share:', error);
      setToast({ message: error.response?.data?.detail || 'Error al agregar deuda compartida', type: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateStatus = async (shareId: string, newStatus: string) => {
    try {
      await statementsAPI.updateDebtShare(shareId, { status: newStatus });
      setToast({ message: 'Estado actualizado', type: 'success' });
      window.location.reload();
    } catch (error: any) {
      console.error('Error updating debt share:', error);
      setToast({ message: error.response?.data?.detail || 'Error al actualizar estado', type: 'error' });
    }
  };

  const handleDeleteShare = async (shareId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta deuda compartida?')) return;
    try {
      await statementsAPI.deleteDebtShare(shareId);
      setToast({ message: 'Deuda compartida eliminada', type: 'success' });
      window.location.reload();
    } catch (error: any) {
      console.error('Error deleting debt share:', error);
      setToast({ message: error.response?.data?.detail || 'Error al eliminar deuda compartida', type: 'error' });
    }
  };

  if (allDebtShares.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold text-white">Deudas Compartidas</h3>
        </div>
        <span className="text-xs text-slate-400">{allDebtShares.length} deuda(s)</span>
      </div>

      {/* Summary */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-purple-400 mb-1">Pendiente Total</p>
            <p className="text-lg font-bold text-purple-300">${(totalPending / 100).toFixed(2)}</p>
          </div>
          <DollarSign className="w-6 h-6 text-purple-400" />
        </div>
      </div>

      {/* List */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
        {allDebtShares.map(ds => (
          <div key={ds.id} className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{ds.person_name}</p>
              <p className="text-xs text-slate-400">{ds.statement.account_name || 'Cuenta desconocida'}</p>
              {ds.description && (
                <p className="text-xs text-slate-500 truncate">{ds.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-sm font-semibold text-purple-400">${(ds.amount / 100).toFixed(2)}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  ds.status === 'paid_to_card' ? 'bg-green-500/20 text-green-400' :
                  ds.status === 'received' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-orange-500/20 text-orange-400'
                }`}>
                  {ds.status === 'paid_to_card' ? 'Pagado a tarjeta' : ds.status === 'received' ? 'Recibido' : 'Pendiente'}
                </span>
              </div>
              <div className="flex gap-1">
                {ds.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(ds.id, 'received')}
                      className="p-1 text-slate-400 hover:text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                      title="Marcar como recibido"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(ds.id, 'paid_to_card')}
                      className="p-1 text-slate-400 hover:text-green-400 hover:bg-green-500/20 rounded transition-colors"
                      title="Marcar como pagado a tarjeta"
                    >
                      <DollarSign className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDeleteShare(ds.id)}
                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                  title="Eliminar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Add Debt Share Modal */}
      {showAddModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal({ isOpen: false, statementId: null })} />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <button
              onClick={() => setShowAddModal({ isOpen: false, statementId: null })}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-white mb-4">Agregar Deuda Compartida</h3>
            <form onSubmit={handleAddShare}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Persona</label>
                  <input
                    type="text"
                    value={formData.person_name}
                    onChange={(e) => setFormData({ ...formData, person_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Descripción (opcional)</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Estado</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="pending">Pendiente</option>
                    <option value="received">Recibido</option>
                    <option value="paid_to_card">Pagado a tarjeta</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal({ isOpen: false, statementId: null })}
                  className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {adding ? 'Agregando...' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtSharesWidget;

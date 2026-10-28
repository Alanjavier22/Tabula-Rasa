import Modal from './common/Modal';
import { useState, useEffect } from 'react';
import { iousAPI, accountsAPI } from '../services/api';
import type { IOU, Account } from '../types';
import { DollarSign, CheckCircle, User, Clock, X } from 'lucide-react';

const IOUWidget = () => {
  const [ious, setIous] = useState<IOU[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [settleModal, setSettleModal] = useState<{ isOpen: boolean; iouId: string | null }>({ isOpen: false, iouId: null });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);

  const fetchPendingIous = async () => {
    try {
      const res = await iousAPI.getPending();
      setIous(res.data);
    } catch (error) {
      console.error('Error fetching IOUs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await accountsAPI.getAll();
      setAccounts(res.data.filter((acc: Account) => acc.is_active));
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([fetchPendingIous(), fetchAccounts()]));
  }, []);

  const handleSettleClick = (iouId: string) => {
    setSettleModal({ isOpen: true, iouId });
    setSelectedAccountId(null);
  };

  const handleSettle = async () => {
    if (!settleModal.iouId || !selectedAccountId) return;

    setSettling(true);
    try {
      await iousAPI.settle(settleModal.iouId, { account_id: selectedAccountId });
      setIous(ious.filter(iou => iou.id !== settleModal.iouId));
      setSettleModal({ isOpen: false, iouId: null });
      setSelectedAccountId(null);
    } catch (error) {
      console.error('Error settling IOU:', error);
    } finally {
      setSettling(false);
    }
  };

  const theyOweTotal = ious.filter(iou => iou.iou_type === 'they_owe').reduce((sum, iou) => sum + iou.amount, 0);
  const iOweTotal = ious.filter(iou => iou.iou_type === 'i_owe').reduce((sum, iou) => sum + iou.amount, 0);

  if (loading) {
    return <div className="bg-surface border border-line rounded-xl p-4">Cargando...</div>;
  }

  if (ious.length === 0) {
    return null;
  }

  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-warning" />
          <h3 className="text-lg font-semibold text-primary">Dinero Flotante</h3>
        </div>
        <span className="text-xs text-muted">{ious.length} pendiente(s)</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-success-soft border border-line rounded-lg p-2 text-center">
          <p className="text-xs text-success mb-1">Me deben</p>
          <p className="text-lg font-bold text-success">${(theyOweTotal / 100).toFixed(2)}</p>
        </div>
        <div className="bg-danger-soft border border-line rounded-lg p-2 text-center">
          <p className="text-xs text-danger mb-1">Debo</p>
          <p className="text-lg font-bold text-danger">${(iOweTotal / 100).toFixed(2)}</p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {ious.map(iou => (
          <div key={iou.id} className="flex items-center justify-between p-2 bg-surface rounded-lg">
            <div className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                iou.iou_type === 'they_owe' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
              }`}>
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-primary truncate">{iou.person_name}</p>
                {iou.description && (
                  <p className="text-xs text-muted truncate">{iou.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className={`text-sm font-semibold ${
                  iou.iou_type === 'they_owe' ? 'text-success' : 'text-danger'
                }`}>
                  {iou.iou_type === 'they_owe' ? '+' : '-'}${(iou.amount / 100).toFixed(2)}
                </p>
                {iou.due_date && (
                  <div className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="w-3 h-3" />
                    {new Date(iou.due_date).toLocaleDateString()}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleSettleClick(iou.id)}
                className="p-1.5 text-muted hover:text-success hover:bg-success-soft rounded transition-colors"
                title="Marcar como saldado"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Account Selection Modal */}
      {settleModal.isOpen && (
        <Modal label="Saldar deuda" onClose={() => setSettleModal({ isOpen: false, iouId: null })}>
          <button
            type="button"
            aria-label="Cerrar modal de saldar cuenta"
            className="absolute inset-0 bg-overlay "
            onClick={() => setSettleModal({ isOpen: false, iouId: null })}
          />
          <div className="relative bg-surface border border-line rounded-xl p-6 w-full max-w-md">
            <button
              onClick={() => setSettleModal({ isOpen: false, iouId: null })}
              className="absolute top-4 right-4 text-muted hover:text-primary"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-primary mb-2">Saldar deuda</h3>
            <p className="text-sm text-muted mb-4">¿En qué cuenta recibiste el dinero?</p>

            <div className="space-y-2 mb-4">
              {accounts.map(account => (
                <button
                  key={account.id}
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`w-full p-3 rounded-lg text-left transition-colors ${
                    selectedAccountId === account.id
                      ? 'bg-accent-soft border border-line text-primary'
                      : 'bg-surface border border-line text-muted hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{account.name}</span>
                    <span className="text-sm">${account.balance.toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleSettle}
              disabled={!selectedAccountId || settling}
              className="w-full py-2 bg-surface-soft   text-primary rounded-lg   disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {settling ? 'Saldando...' : 'Confirmar Saldado'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default IOUWidget;

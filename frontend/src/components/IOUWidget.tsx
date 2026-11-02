import Modal from './common/Modal';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { iousAPI, accountsAPI } from '../services/api';
import type { IOU, Account } from '../types';
import { formatMoney } from '../utils/money';
import { DollarSign, CheckCircle, User, Clock, X } from 'lucide-react';

const IOUWidget = () => {
  const queryClient = useQueryClient();
  const [ious, setIous] = useState<IOU[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [settleModal, setSettleModal] = useState<{
    isOpen: boolean;
    iouId: string | null;
  }>({ isOpen: false, iouId: null });
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
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
    void Promise.resolve().then(() =>
      Promise.all([fetchPendingIous(), fetchAccounts()]),
    );
  }, []);

  const handleSettleClick = (iouId: string) => {
    setSettleModal({ isOpen: true, iouId });
    setSelectedAccountId(null);
  };

  const handleSettle = async () => {
    if (!settleModal.iouId || !selectedAccountId) return;

    setSettling(true);
    try {
      await iousAPI.settle(settleModal.iouId, {
        account_id: selectedAccountId,
      });
      setIous(ious.filter((iou) => iou.id !== settleModal.iouId));
      setSettleModal({ isOpen: false, iouId: null });
      setSelectedAccountId(null);
      void queryClient.invalidateQueries({ queryKey: ['pendingIOUs'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
    } catch (error) {
      console.error('Error settling IOU:', error);
    } finally {
      setSettling(false);
    }
  };

  const theyOweTotal = ious
    .filter((iou) => iou.iou_type === 'they_owe')
    .reduce((sum, iou) => sum + iou.amount, 0);
  const iOweTotal = ious
    .filter((iou) => iou.iou_type === 'i_owe')
    .reduce((sum, iou) => sum + iou.amount, 0);

  if (loading) {
    return (
      <div className="app-surface p-5">
        <output className="app-inline-message">
          Cargando préstamos personales…
        </output>
      </div>
    );
  }

  return (
    <section className="app-surface p-5" aria-label="Dinero flotante y préstamos">
      <div className="app-section-heading mb-3">
        <div>
          <span className="dashboard-panel-kicker">Cuentas personales</span>
          <h3 className="app-section-title">Dinero flotante (IOUs)</h3>
        </div>
        <span className="text-xs text-muted">{ious.length} pendiente(s)</span>
      </div>

      <div className="chart-kpi-strip mb-3">
        <div className="chart-kpi-item">
          <span>Me deben</span>
          <strong className="text-success">
            $ {formatMoney(theyOweTotal)}
          </strong>
        </div>
        <div className="chart-kpi-item">
          <span>Debo</span>
          <strong className="text-danger">$ {formatMoney(iOweTotal)}</strong>
        </div>
      </div>

      {ious.length === 0 ? (
        <p className="dashboard-rail-empty">
          No hay préstamos personales pendientes por saldar.
        </p>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {ious.map((iou) => (
            <div key={iou.id} className="account-share-item">
              <div className="account-share-person">
                <span
                  className={`account-share-avatar ${
                    iou.iou_type === 'they_owe' ? 'text-success' : 'text-danger'
                  }`}
                >
                  <User className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div>
                  <span className="block">{iou.person_name}</span>
                  {iou.description && (
                    <span className="block text-xs text-muted font-normal">
                      {iou.description}
                    </span>
                  )}
                </div>
              </div>
              <div className="account-share-amount">
                <div className="text-right">
                  <strong
                    className={
                      iou.iou_type === 'they_owe'
                        ? 'text-success'
                        : 'text-danger'
                    }
                  >
                    {iou.iou_type === 'they_owe' ? '+' : '−'}${' '}
                    {formatMoney(iou.amount)}
                  </strong>
                  {iou.due_date && (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {new Date(iou.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleSettleClick(iou.id)}
                  className="account-card-action"
                  title="Marcar como saldado"
                  aria-label={`Marcar como saldado préstamo de ${iou.person_name}`}
                >
                  <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {settleModal.isOpen && (
        <Modal
          label="Saldar deuda"
          onClose={() => setSettleModal({ isOpen: false, iouId: null })}
        >
          <div className="relative bg-surface border border-line p-6 w-full max-w-md">
            <button
              type="button"
              onClick={() => setSettleModal({ isOpen: false, iouId: null })}
              className="absolute top-4 right-4 text-muted hover:text-primary"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-primary mb-2 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-accent-strong" />
              Saldar préstamo
            </h3>
            <p className="text-sm text-muted mb-4">
              Selecciona la cuenta donde se registró el movimiento:
            </p>

            <div className="space-y-2 mb-4">
              {accounts.map((account) => (
                <button
                  type="button"
                  key={account.id}
                  onClick={() => setSelectedAccountId(account.id)}
                  className={`w-full p-3 rounded text-left transition-colors ${
                    selectedAccountId === account.id
                      ? 'bg-accent-soft border border-line text-primary'
                      : 'bg-surface-soft border border-line text-muted hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{account.name}</span>
                    <span className="text-sm font-mono">
                      $ {formatMoney(account.balance)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleSettle}
              disabled={!selectedAccountId || settling}
              className="app-btn app-btn-primary w-full justify-center disabled:opacity-50"
            >
              {settling ? 'Saldando…' : 'Confirmar saldado'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
};

export default IOUWidget;

import Modal from './common/Modal';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { statementsAPI } from '../services/api';
import type { CreditCardStatement, DebtShare, Cents } from '../types';
import type { AxiosError } from 'axios';
import { formatMoney } from '../utils/money';
import { Users, DollarSign, CheckCircle, X, Plus } from 'lucide-react';
import Toast from './Toast';

const getDebtShareStatusClass = (status: string) => {
  if (status === 'paid_to_card') return 'is-good';
  if (status === 'received') return 'is-warning';
  return 'is-danger';
};

const getDebtShareStatusLabel = (status: string) => {
  if (status === 'paid_to_card') return 'A tarjeta';
  if (status === 'received') return 'Recibido';
  return 'Pendiente';
};

const DebtSharesWidget = ({
  statements,
}: {
  statements: CreditCardStatement[];
}) => {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [showAddModal, setShowAddModal] = useState<{
    isOpen: boolean;
    statementId: string | null;
  }>({ isOpen: false, statementId: null });
  const [formData, setFormData] = useState({
    person_name: '',
    amount: '',
    description: '',
    status: 'pending',
  });
  const [adding, setAdding] = useState(false);

  const allDebtShares: Array<DebtShare & { statement: CreditCardStatement }> =
    [];
  statements.forEach((stmt) => {
    if (stmt.debt_shares && stmt.debt_shares.length > 0) {
      stmt.debt_shares.forEach((ds) => {
        allDebtShares.push({ ...ds, statement: stmt });
      });
    }
  });

  const pendingShares = allDebtShares.filter((ds) => ds.status === 'pending');
  const totalPending = pendingShares.reduce((sum, ds) => sum + ds.amount, 0);

  const invalidateStatements = () => {
    void queryClient.invalidateQueries({ queryKey: ['statements'] });
    void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
  };

  const handleAddDebtShare = () => {
    if (statements.length === 0) {
      setToast({
        message:
          'Primero crea un estado de cuenta para tu tarjeta de crédito en Cuentas',
        type: 'error',
      });
      return;
    }
    setShowAddModal({ isOpen: true, statementId: statements[0].id });
  };

  const handleAddShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddModal.statementId) return;

    setAdding(true);
    try {
      await statementsAPI.addDebtShare(showAddModal.statementId, {
        person_name: formData.person_name,
        amount: Math.round(
          Number.parseFloat(formData.amount) * 100,
        ) as Cents,
        description: formData.description || undefined,
        status: formData.status,
      });
      setToast({ message: 'Deuda compartida agregada', type: 'success' });
      setShowAddModal({ isOpen: false, statementId: null });
      setFormData({
        person_name: '',
        amount: '',
        description: '',
        status: 'pending',
      });
      invalidateStatements();
    } catch (error) {
      console.error('Error adding debt share:', error);
      setToast({
        message:
          (error as AxiosError<{ detail?: string }>).response?.data?.detail ||
          'Error al agregar deuda compartida',
        type: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateStatus = async (shareId: string, newStatus: string) => {
    try {
      await statementsAPI.updateDebtShare(shareId, { status: newStatus });
      setToast({ message: 'Estado actualizado', type: 'success' });
      invalidateStatements();
    } catch (error) {
      console.error('Error updating debt share:', error);
      setToast({
        message:
          (error as AxiosError<{ detail?: string }>).response?.data?.detail ||
          'Error al actualizar estado',
        type: 'error',
      });
    }
  };

  const handleDeleteShare = async (shareId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta deuda compartida?')) return;
    try {
      await statementsAPI.deleteDebtShare(shareId);
      setToast({ message: 'Deuda compartida eliminada', type: 'success' });
      invalidateStatements();
    } catch (error) {
      console.error('Error deleting debt share:', error);
      setToast({
        message:
          (error as AxiosError<{ detail?: string }>).response?.data?.detail ||
          'Error al eliminar deuda compartida',
        type: 'error',
      });
    }
  };

  return (
    <section className="app-surface p-5" aria-label="Deudas compartidas">
      <div className="app-section-heading mb-3">
        <div>
          <span className="dashboard-panel-kicker">Consumos en tarjeta</span>
          <h3 className="app-section-title">Deudas compartidas</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">
            {allDebtShares.length} registro(s)
          </span>
          <button
            type="button"
            onClick={handleAddDebtShare}
            className="account-card-action"
            title="Agregar deuda compartida"
            aria-label="Agregar deuda compartida"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="chart-kpi-strip mb-3">
        <div className="chart-kpi-item">
          <span>Pendiente por cobrar</span>
          <strong className="text-accent-strong">
            $ {formatMoney(totalPending)}
          </strong>
        </div>
        <div className="chart-kpi-item">
          <span>Cuotas pendientes</span>
          <strong>{pendingShares.length}</strong>
        </div>
      </div>

      {allDebtShares.length === 0 ? (
        <p className="dashboard-rail-empty">
          No hay consumos compartidos registrados en tus estados de cuenta.
        </p>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {allDebtShares.map((ds) => (
            <div key={ds.id} className="account-share-item">
              <div className="account-share-person">
                <span className="account-share-avatar">
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div>
                  <span className="block">{ds.person_name}</span>
                  <span className="block text-xs text-muted font-normal">
                    {ds.statement.account_name || 'Tarjeta'}
                    {ds.description ? ` · ${ds.description}` : ''}
                  </span>
                </div>
              </div>
              <div className="account-share-amount">
                <div className="text-right">
                  <strong className="block">$ {formatMoney(ds.amount)}</strong>
                  <span
                    className={`sentinel-status-badge ${getDebtShareStatusClass(
                      ds.status,
                    )}`}
                  >
                    {getDebtShareStatusLabel(ds.status)}
                  </span>
                </div>
                <div className="flex gap-1">
                  {ds.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(ds.id, 'received')}
                        className="account-card-action"
                        title="Marcar como recibido"
                        aria-label={`Marcar cobro de ${ds.person_name} como recibido`}
                      >
                        <CheckCircle
                          className="w-3.5 h-3.5"
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateStatus(ds.id, 'paid_to_card')
                        }
                        className="account-card-action"
                        title="Marcar como abonado a tarjeta"
                        aria-label={`Marcar cobro de ${ds.person_name} como abonado a tarjeta`}
                      >
                        <DollarSign
                          className="w-3.5 h-3.5"
                          aria-hidden="true"
                        />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteShare(ds.id)}
                    className="account-card-action account-card-action-delete"
                    title="Eliminar"
                    aria-label={`Eliminar deuda compartida de ${ds.person_name}`}
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {showAddModal.isOpen && (
        <Modal
          onClose={() => setShowAddModal({ isOpen: false, statementId: null })}
          label={'Agregar deuda compartida'}
        >
          <div className="relative bg-surface border border-line p-6 w-full max-w-md">
            <button
              type="button"
              onClick={() =>
                setShowAddModal({ isOpen: false, statementId: null })
              }
              className="absolute top-4 right-4 text-muted hover:text-primary"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-primary mb-4">
              Agregar deuda compartida
            </h3>
            <form onSubmit={handleAddShare}>
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="debt-share-person"
                    className="block text-sm font-medium text-muted mb-1"
                  >
                    Persona
                  </label>
                  <input
                    id="debt-share-person"
                    type="text"
                    value={formData.person_name}
                    onChange={(e) =>
                      setFormData({ ...formData, person_name: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-surface border border-line rounded text-primary"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="debt-share-amount"
                    className="block text-sm font-medium text-muted mb-1"
                  >
                    Monto (USD)
                  </label>
                  <input
                    id="debt-share-amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({ ...formData, amount: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-surface border border-line rounded text-primary"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="debt-share-description"
                    className="block text-sm font-medium text-muted mb-1"
                  >
                    Descripción (opcional)
                  </label>
                  <input
                    id="debt-share-description"
                    type="text"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-surface border border-line rounded text-primary"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() =>
                    setShowAddModal({ isOpen: false, statementId: null })
                  }
                  className="app-btn flex-1 justify-center"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="app-btn app-btn-primary flex-1 justify-center"
                >
                  {adding ? 'Agregando…' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </section>
  );
};

export default DebtSharesWidget;

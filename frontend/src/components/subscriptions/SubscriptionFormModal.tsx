import Modal from '../common/Modal';
import type { Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, X } from 'lucide-react';
import type { Account, Category, Subscription, SubscriptionFrequency } from '../../types';
import Select from '../common/Select';
import DatePicker from '../common/DatePicker';

export interface SubscriptionFormData {
  name: string;
  amount: string;
  frequency: SubscriptionFrequency;
  next_billing_date: string;
  account_id: string;
  category_id: string;
  is_active: boolean;
}

interface SubscriptionFormModalProps {
  isOpen: boolean;
  editingSubscription: Subscription | null;
  form: SubscriptionFormData;
  setForm: Dispatch<SetStateAction<SubscriptionFormData>>;
  categories: Category[];
  accounts: Account[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const SubscriptionFormModal = ({ isOpen, editingSubscription, form, setForm, categories, accounts, saving, onClose, onSubmit }: SubscriptionFormModalProps) => {
  const submitLabel = editingSubscription ? 'Actualizar Servicio' : 'Activar Suscripción';

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose} label={'Suscripción'}>
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="relative w-full max-w-lg bg-canvas rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center border border-line text-accent-strong">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-primary tracking-tight">
                    {editingSubscription ? 'Ajustar Suscripción' : 'Nueva Suscripción'}
                  </h2>
                  <p className="text-[11px] text-muted font-bold tracking-wider uppercase">Parámetros del Servicio</p>
                </div>
              </div>
              <button
                aria-label="Cerrar diálogo"
                onClick={onClose}
                className="w-9 h-9 rounded-lg hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={onSubmit}
              className="p-6 space-y-5 overflow-y-auto custom-scrollbar overscroll-contain"
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="subscription-name" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                    Nombre del Servicio
                  </label>
                  <input
                    id="subscription-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-semibold focus:outline-none focus:border-line transition-all text-sm"
                    placeholder="Ej: Netflix, Spotify, AWS..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="subscription-amount" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Monto por Ciclo ($)
                    </label>
                    <input
                      id="subscription-amount"
                      type="number"
                      step="0.01"
                      required
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-bold tabular-nums focus:outline-none focus:border-line transition-all text-base"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="subscription-frequency" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Ciclo de Facturación
                    </label>
                    <Select
                      id="subscription-frequency"
                      value={form.frequency}
                      onChange={(value) => setForm({ ...form, frequency: value as SubscriptionFrequency })}
                      options={[
                        { value: 'weekly', label: 'Semanal' },
                        { value: 'monthly', label: 'Mensual' },
                        { value: 'quarterly', label: 'Trimestral' },
                        { value: 'yearly', label: 'Anual' }
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="subscription-next-billing" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Próximo Cobro
                    </label>
                    <DatePicker
                      id="subscription-next-billing"
                      value={form.next_billing_date}
                      onChange={(value) => setForm({ ...form, next_billing_date: value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="subscription-account" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Cuenta de Cargo
                    </label>
                    <Select
                      id="subscription-account"
                      value={form.account_id}
                      onChange={(value) => setForm({ ...form, account_id: value })}
                      options={[
                        { value: '', label: 'Sin cuenta' },
                        ...accounts.map((acc) => ({ value: acc.id, label: acc.name }))
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="subscription-category" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                    Categoría del Gasto
                  </label>
                  <Select
                    id="subscription-category"
                    value={form.category_id}
                    onChange={(value) => setForm({ ...form, category_id: value })}
                    options={[
                      { value: '', label: 'Sin categoría' },
                      ...categories.map((cat) => ({ value: cat.id, label: cat.name }))
                    ]}
                  />
                </div>

                <label htmlFor="isActiveToggleSub" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-soft border border-line cursor-pointer">
                  <input
                    type="checkbox"
                    id="isActiveToggleSub"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-line text-accent-strong focus:ring-accent-strong"
                  />
                  <span className="text-xs font-semibold text-primary select-none">Suscripción activa</span>
                </label>
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-line">
                <button
                  type="button"
                  onClick={onClose}
                  className="app-btn app-btn-ghost"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="app-btn app-btn-primary disabled:opacity-50"
                >
                  {saving ? 'Procesando...' : submitLabel}
                </button>
              </div>
            </form>
          </motion.div>
        </Modal>
      )}
    </AnimatePresence>
  );
};

export default SubscriptionFormModal;

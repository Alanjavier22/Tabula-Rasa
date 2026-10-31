import Modal from '../common/Modal';
import type { Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, X } from 'lucide-react';
import type { Category } from '../../types';
import Select from '../common/Select';

export interface BudgetFormData {
  name: string;
  amount: string;
  month: number;
  year: number;
  category_id: string;
}

export interface RecurringFormData {
  month: number;
  year: number;
  delete_previous: boolean;
}

interface BudgetFormModalProps {
  showCreateModal: boolean;
  showEditModal: boolean;
  showRecurringModal: boolean;
  form: BudgetFormData;
  setForm: Dispatch<SetStateAction<BudgetFormData>>;
  editForm: BudgetFormData;
  setEditForm: Dispatch<SetStateAction<BudgetFormData>>;
  recurringForm: RecurringFormData;
  setRecurringForm: Dispatch<SetStateAction<RecurringFormData>>;
  categories: Category[];
  saving: boolean;
  onClose: () => void;
  onCreateSubmit: (e: React.FormEvent) => void;
  onEditSubmit: (e: React.FormEvent) => void;
  onGenerateRecurring: (e: React.FormEvent) => void;
}

const BudgetFormModal = ({
  showCreateModal,
  showEditModal,
  showRecurringModal,
  form,
  setForm,
  editForm,
  setEditForm,
  recurringForm,
  setRecurringForm,
  categories,
  saving,
  onClose,
  onCreateSubmit,
  onEditSubmit,
  onGenerateRecurring,
}: BudgetFormModalProps) => {
  let modalTitle = 'Generar Recurrente';
  if (showCreateModal) {
    modalTitle = 'Nuevo presupuesto';
  } else if (showEditModal) {
    modalTitle = 'Editar presupuesto';
  }

  return (
    <AnimatePresence>
      {(showCreateModal || showEditModal || showRecurringModal) && (
        <Modal onClose={onClose} label={modalTitle}>
          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="relative w-full max-w-lg bg-canvas rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-accent-soft flex items-center justify-center border border-line">
                  {showRecurringModal ? <RefreshCw className="w-4 h-4 text-accent-strong" /> : <Plus className="w-4 h-4 text-accent-strong" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-primary tracking-tight">
                    {modalTitle}
                  </h2>
                  <p className="text-[11px] text-muted font-bold tracking-wider uppercase">Configuración de Presupuesto</p>
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

            {showCreateModal && (
              <form onSubmit={onCreateSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar overscroll-contain">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="budget-name" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Nombre del Presupuesto
                    </label>
                    <input
                      id="budget-name"
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-semibold focus:outline-none focus:border-line transition-all text-sm"
                      placeholder="Ej: Alimentación, Ocio, Servicios..."
                    />
                  </div>
                  <div>
                    <label htmlFor="budget-max-amount" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Monto Máximo ($)
                    </label>
                    <input
                      id="budget-max-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-bold tabular-nums focus:outline-none focus:border-line transition-all text-base"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="budget-month" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                        Mes Vigencia
                      </label>
                      <Select
                        id="budget-month"
                        value={form.month.toString()}
                        onChange={(value) => setForm({ ...form, month: Number.parseInt(value) })}
                        options={Array.from({ length: 12 }, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="budget-year" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                        Año
                      </label>
                      <Select
                        id="budget-year"
                        value={form.year.toString()}
                        onChange={(value) => setForm({ ...form, year: Number.parseInt(value) })}
                        options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="budget-category" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Vincular Categoría
                    </label>
                    <Select
                      id="budget-category"
                      value={form.category_id}
                      onChange={(value) => setForm({ ...form, category_id: value })}
                      options={[
                        { value: '', label: 'Sin categoría vinculada' },
                        ...categories.map(c => ({ value: c.id, label: c.name }))
                      ]}
                    />
                  </div>
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
                    {saving ? 'Guardando...' : 'Confirmar Presupuesto'}
                  </button>
                </div>
              </form>
            )}

            {showEditModal && (
              <form onSubmit={onEditSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar overscroll-contain">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="edit-budget-name" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Nombre
                    </label>
                    <input
                      id="edit-budget-name"
                      type="text"
                      required
                      value={editForm.name}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-semibold focus:outline-none focus:border-line text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-budget-amount" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Monto ($)
                    </label>
                    <input
                      id="edit-budget-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={editForm.amount}
                      onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-bold tabular-nums focus:outline-none focus:border-line text-base"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="edit-budget-month" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                        Mes
                      </label>
                      <Select
                        id="edit-budget-month"
                        value={editForm.month.toString()}
                        onChange={(value) => setEditForm({ ...editForm, month: Number.parseInt(value) })}
                        options={Array.from({ length: 12 }, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-budget-year" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                        Año
                      </label>
                      <Select
                        id="edit-budget-year"
                        value={editForm.year.toString()}
                        onChange={(value) => setEditForm({ ...editForm, year: Number.parseInt(value) })}
                        options={[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="edit-budget-category" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Categoría
                    </label>
                    <Select
                      id="edit-budget-category"
                      value={editForm.category_id}
                      onChange={(value) => setEditForm({ ...editForm, category_id: value })}
                      options={[
                        { value: '', label: 'Sin categoría' },
                        ...categories.map(c => ({ value: c.id, label: c.name }))
                      ]}
                    />
                  </div>
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
                    {saving ? 'Guardando...' : 'Actualizar Límites'}
                  </button>
                </div>
              </form>
            )}

            {showRecurringModal && (
              <form onSubmit={onGenerateRecurring} className="p-6 space-y-5 overflow-y-auto custom-scrollbar overscroll-contain">
                <div className="p-4 bg-success-soft rounded-xl border border-line">
                  <div className="flex gap-3">
                    <div className="p-1.5 h-fit bg-surface rounded-lg text-success border border-line">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <p className="text-xs text-primary leading-relaxed">
                      Esta acción copiará los presupuestos definidos en el mes anterior al mes destino sin necesidad de reconfigurarlos manualmente.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="recurring-budget-month" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Destino: Mes
                    </label>
                    <Select
                      id="recurring-budget-month"
                      value={recurringForm.month.toString()}
                      onChange={(value) => setRecurringForm({ ...recurringForm, month: Number.parseInt(value) })}
                      options={Array.from({ length: 12 }, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="recurring-budget-year" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Destino: Año
                    </label>
                    <Select
                      id="recurring-budget-year"
                      value={recurringForm.year.toString()}
                      onChange={(value) => setRecurringForm({ ...recurringForm, year: Number.parseInt(value) })}
                      options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                    />
                  </div>
                </div>
                <label htmlFor="delete_previous" className="flex items-center gap-3 px-3 py-2.5 bg-surface-soft rounded-xl border border-line cursor-pointer">
                  <input
                    type="checkbox"
                    id="delete_previous"
                    checked={recurringForm.delete_previous}
                    onChange={e => setRecurringForm({ ...recurringForm, delete_previous: e.target.checked })}
                    className="w-4 h-4 rounded border-line bg-canvas text-success focus:ring-success"
                  />
                  <span className="text-xs font-semibold text-primary select-none">
                    Limpiar registros previos del mes destino
                  </span>
                </label>
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
                    {saving ? 'Procesando...' : 'Sincronizar Mes'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </Modal>
      )}
    </AnimatePresence>
  );
};

export default BudgetFormModal;

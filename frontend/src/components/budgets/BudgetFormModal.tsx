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
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-overlay "
          />

          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-canvas rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center border border-line">
                  {showRecurringModal ? <RefreshCw className="w-5 h-5 text-accent-strong" /> : <Plus className="w-5 h-5 text-accent-strong" />}
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-black text-primary tracking-tight">
                    {modalTitle}
                  </h2>
                  <p className="text-xs text-muted font-medium tracking-wide uppercase">Configuración de Presupuesto</p>
                </div>
              </div>
              <button aria-label="Cerrar diálogo"
                onClick={onClose}
                className="w-10 h-10 rounded-xl hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {showCreateModal && (
              <form onSubmit={onCreateSubmit} className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="budget-name" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Nombre del Presupuesto</label>
                    <input
                      id="budget-name"
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary font-bold focus:outline-none focus:border-line transition-all"
                      placeholder="Ej: Alimentación, Ocio, Servicios..."
                    />
                  </div>
                  <div>
                    <label htmlFor="budget-max-amount" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Monto Máximo ($)</label>
                    <input
                      id="budget-max-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={form.amount}
                      onChange={e => setForm({...form, amount: e.target.value})}
                      className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary font-bold focus:outline-none focus:border-line transition-all text-xl"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="budget-month" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Mes Vigencia</label>
                      <Select
                        id="budget-month"
                        value={form.month.toString()}
                        onChange={(value) => setForm({...form, month: Number.parseInt(value)})}
                        options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="budget-year" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Año</label>
                      <Select
                        id="budget-year"
                        value={form.year.toString()}
                        onChange={(value) => setForm({...form, year: Number.parseInt(value)})}
                        options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="budget-category" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Vincular Categoría</label>
                    <Select
                      id="budget-category"
                      value={form.category_id}
                      onChange={(value) => setForm({...form, category_id: value})}
                      options={[
                        { value: '', label: 'Sin categoría vinculada' },
                        ...categories.map(c => ({ value: c.id, label: c.name }))
                      ]}
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-4 rounded-2xl bg-surface-soft border border-line text-primary text-xs font-black uppercase tracking-widest hover:bg-surface-soft transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] px-6 py-4 rounded-2xl bg-surface-soft   text-primary text-xs font-black uppercase tracking-widest hover:shadow-lg  transition-all disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Confirmar Presupuesto'}
                  </button>
                </div>
              </form>
            )}

            {showEditModal && (
              <form onSubmit={onEditSubmit} className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="edit-budget-name" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Nombre</label>
                    <input
                      id="edit-budget-name"
                      type="text"
                      required
                      value={editForm.name}
                      onChange={e => setEditForm({...editForm, name: e.target.value})}
                      className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary font-bold focus:outline-none focus:border-line"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-budget-amount" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Monto ($)</label>
                    <input
                      id="edit-budget-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={editForm.amount}
                      onChange={e => setEditForm({...editForm, amount: e.target.value})}
                      className="w-full bg-surface-soft border border-line rounded-2xl px-5 py-4 text-primary font-bold focus:outline-none focus:border-line text-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="edit-budget-month" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Mes</label>
                      <Select
                        id="edit-budget-month"
                        value={editForm.month.toString()}
                        onChange={(value) => setEditForm({...editForm, month: Number.parseInt(value)})}
                        options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-budget-year" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Año</label>
                      <Select
                        id="edit-budget-year"
                        value={editForm.year.toString()}
                        onChange={(value) => setEditForm({...editForm, year: Number.parseInt(value)})}
                        options={[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="edit-budget-category" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Categoría</label>
                    <Select
                      id="edit-budget-category"
                      value={editForm.category_id}
                      onChange={(value) => setEditForm({...editForm, category_id: value})}
                      options={[
                        { value: '', label: 'Sin categoría' },
                        ...categories.map(c => ({ value: c.id, label: c.name }))
                      ]}
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-4 rounded-2xl bg-surface-soft border border-line text-primary text-xs font-black uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] px-6 py-4 rounded-2xl bg-surface-soft   text-primary text-xs font-black uppercase tracking-widest hover:shadow-lg transition-all"
                  >
                    {saving ? 'Guardando...' : 'Actualizar Límites'}
                  </button>
                </div>
              </form>
            )}

            {showRecurringModal && (
              <form onSubmit={onGenerateRecurring} className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
                <div className="p-5 bg-success-soft rounded-3xl border border-line mb-2">
                  <div className="flex gap-4">
                    <div className="p-2 h-fit bg-success-soft rounded-xl text-success">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-muted leading-relaxed">
                      Esta acción copiará los presupuestos definidos en el mes anterior al mes actual, permitiéndote mantener tus metas sin reconfigurar todo.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="recurring-budget-month" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Destino: Mes</label>
                    <Select
                      id="recurring-budget-month"
                      value={recurringForm.month.toString()}
                      onChange={(value) => setRecurringForm({...recurringForm, month: Number.parseInt(value)})}
                      options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                    />
                  </div>
                  <div>
                    <label htmlFor="recurring-budget-year" className="block text-xs font-black text-muted uppercase tracking-widest mb-2 ml-1">Destino: Año</label>
                    <Select
                      id="recurring-budget-year"
                      value={recurringForm.year.toString()}
                      onChange={(value) => setRecurringForm({...recurringForm, year: Number.parseInt(value)})}
                      options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-surface-soft rounded-2xl border border-line">
                  <input
                    type="checkbox"
                    id="delete_previous"
                    checked={recurringForm.delete_previous}
                    onChange={e => setRecurringForm({...recurringForm, delete_previous: e.target.checked})}
                    className="w-5 h-5 rounded-lg border-line bg-canvas text-success focus:ring-success transition-all"
                  />
                  <label htmlFor="delete_previous" className="text-xs font-bold text-muted cursor-pointer">
                    Limpiar registros previos del mes destino
                  </label>
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-4 rounded-2xl bg-surface-soft border border-line text-primary text-xs font-black uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] px-6 py-4 rounded-2xl bg-surface-soft   text-primary text-xs font-black uppercase tracking-widest shadow-lg "
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

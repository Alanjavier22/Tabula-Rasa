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
  return (
    <AnimatePresence>
      {(showCreateModal || showEditModal || showRecurringModal) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xl"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                  {showRecurringModal ? <RefreshCw className="w-5 h-5 text-purple-400" /> : <Plus className="w-5 h-5 text-purple-400" />}
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-black text-white tracking-tight">
                    {showCreateModal ? 'Nuevo Límite' : showEditModal ? 'Ajustar Límite' : 'Generar Recurrente'}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Configuración de Presupuesto</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-xl hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {showCreateModal && (
              <form onSubmit={onCreateSubmit} className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Nombre del Presupuesto</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-bold focus:outline-none focus:border-purple-500/50 transition-all"
                      placeholder="Ej: Alimentación, Ocio, Servicios..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Monto Máximo ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={form.amount}
                      onChange={e => setForm({...form, amount: e.target.value})}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-bold focus:outline-none focus:border-purple-500/50 transition-all text-xl"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Mes Vigencia</label>
                      <Select
                        value={form.month.toString()}
                        onChange={(value) => setForm({...form, month: parseInt(value)})}
                        options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Año</label>
                      <Select
                        value={form.year.toString()}
                        onChange={(value) => setForm({...form, year: parseInt(value)})}
                        options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Vincular Categoría</label>
                    <Select
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
                    className="flex-1 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] px-6 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50"
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
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Nombre</label>
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={e => setEditForm({...editForm, name: e.target.value})}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-bold focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Monto ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={editForm.amount}
                      onChange={e => setEditForm({...editForm, amount: e.target.value})}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-bold focus:outline-none focus:border-purple-500/50 text-xl"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Mes</label>
                      <Select
                        value={editForm.month.toString()}
                        onChange={(value) => setEditForm({...editForm, month: parseInt(value)})}
                        options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Año</label>
                      <Select
                        value={editForm.year.toString()}
                        onChange={(value) => setEditForm({...editForm, year: parseInt(value)})}
                        options={[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Categoría</label>
                    <Select
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
                    className="flex-1 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-lg transition-all"
                  >
                    {saving ? 'Guardando...' : 'Actualizar Límites'}
                  </button>
                </div>
              </form>
            )}

            {showRecurringModal && (
              <form onSubmit={onGenerateRecurring} className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
                <div className="p-5 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 mb-2">
                  <div className="flex gap-4">
                    <div className="p-2 h-fit bg-emerald-500/10 rounded-xl text-emerald-400">
                      <RefreshCw className="w-5 h-5" />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Esta acción copiará los presupuestos definidos en el mes anterior al mes actual, permitiéndote mantener tus metas sin reconfigurar todo.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Destino: Mes</label>
                    <Select
                      value={recurringForm.month.toString()}
                      onChange={(value) => setRecurringForm({...recurringForm, month: parseInt(value)})}
                      options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Destino: Año</label>
                    <Select
                      value={recurringForm.year.toString()}
                      onChange={(value) => setRecurringForm({...recurringForm, year: parseInt(value)})}
                      options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 bg-black/20 rounded-2xl border border-white/5">
                  <input
                    type="checkbox"
                    id="delete_previous"
                    checked={recurringForm.delete_previous}
                    onChange={e => setRecurringForm({...recurringForm, delete_previous: e.target.checked})}
                    className="w-5 h-5 rounded-lg border-white/10 bg-slate-900 text-emerald-500 focus:ring-emerald-500/50 transition-all"
                  />
                  <label htmlFor="delete_previous" className="text-xs font-bold text-slate-300 cursor-pointer">
                    Limpiar registros previos del mes destino
                  </label>
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] px-6 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-900/20"
                  >
                    {saving ? 'Procesando...' : 'Sincronizar Mes'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BudgetFormModal;

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
  return (
    <AnimatePresence>
      {isOpen && (
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
            className="relative w-full max-w-xl bg-slate-900 rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
                  <Smartphone className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    {editingSubscription ? 'Ajustar Suscripción' : 'Nueva Suscripción'}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Parámetros del Servicio</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 md:w-12 md:h-12 rounded-2xl hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all"
              >
                <X className="w-6 h-6 md:w-8 md:h-8" />
              </button>
            </div>

            <form
              onSubmit={onSubmit}
              className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain"
            >
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Nombre del Servicio</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-bold focus:outline-none focus:border-purple-500/50 transition-all text-lg"
                    placeholder="Ej: Netflix, Spotify, AWS..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Monto por Ciclo ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-black focus:outline-none focus:border-purple-500/50 transition-all text-2xl"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Ciclo de Facturación</label>
                    <Select
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

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Próximo Cobro</label>
                    <DatePicker
                      value={form.next_billing_date}
                      onChange={(value) => setForm({ ...form, next_billing_date: value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Cuenta de Cargo</label>
                    <Select
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
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Categoría del Gasto</label>
                  <Select
                    value={form.category_id}
                    onChange={(value) => setForm({ ...form, category_id: value })}
                    options={[
                      { value: '', label: 'Sin categoría' },
                      ...categories.map((cat) => ({ value: cat.id, label: cat.name }))
                    ]}
                  />
                </div>

                <div className="flex items-center gap-4 px-4 py-2">
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      id="isActiveToggleSub"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                    <span className="ml-3 text-xs font-black text-slate-300 uppercase tracking-widest cursor-pointer select-none">Suscripción Activa</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-8 py-5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-[2] px-8 py-5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-xl hover:shadow-purple-500/20 transition-all disabled:opacity-50"
                >
                  {saving ? 'Procesando...' : editingSubscription ? 'Actualizar Servicio' : 'Activar Suscripción'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SubscriptionFormModal;

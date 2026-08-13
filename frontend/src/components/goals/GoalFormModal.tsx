import type { Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, X } from 'lucide-react';
import type { GoalStatus } from '../../types';
import Select from '../common/Select';
import DatePicker from '../common/DatePicker';

export interface GoalFormData {
  name: string;
  target_amount: string;
  target_date: string;
  description: string;
  status: GoalStatus;
}

interface GoalFormModalProps {
  isCreate: boolean;
  isOpen: boolean;
  form: GoalFormData;
  setForm: Dispatch<SetStateAction<GoalFormData>>;
  editForm: GoalFormData;
  setEditForm: Dispatch<SetStateAction<GoalFormData>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const GoalFormModal = ({ isCreate, isOpen, form, setForm, editForm, setEditForm, saving, onClose, onSubmit }: GoalFormModalProps) => {
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
            className="relative w-full max-w-lg bg-slate-900 rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 md:p-10 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                  <Target className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    {isCreate ? 'Nuevo Objetivo' : 'Ajustar Meta'}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Parámetros de Crecimiento</p>
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
              className="p-6 md:p-10 space-y-6 md:space-y-8 overflow-y-auto custom-scrollbar overscroll-contain"
            >
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Nombre de la Meta</label>
                  <input
                    type="text"
                    required
                    value={isCreate ? form.name : editForm.name}
                    onChange={e => isCreate ? setForm({...form, name: e.target.value}) : setEditForm({...editForm, name: e.target.value})}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-bold focus:outline-none focus:border-emerald-500/50 transition-all text-lg"
                    placeholder="Ej: Nuevo Auto, Fondo de Emergencia..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Capital Objetivo ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={isCreate ? form.target_amount : editForm.target_amount}
                      onChange={e => isCreate ? setForm({...form, target_amount: e.target.value}) : setEditForm({...editForm, target_amount: e.target.value})}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-black focus:outline-none focus:border-emerald-500/50 transition-all text-2xl"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Fecha Límite</label>
                    <DatePicker
                      value={isCreate ? form.target_date : editForm.target_date}
                      onChange={(value) => isCreate ? setForm({...form, target_date: value}) : setEditForm({...editForm, target_date: value})}
                      placeholder="Elegir fecha"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Estado de la Misión</label>
                  <Select
                    value={isCreate ? form.status : editForm.status}
                    onChange={(value) => isCreate ? setForm({...form, status: value as GoalStatus}) : setEditForm({...editForm, status: value as GoalStatus})}
                    options={[
                      { value: 'active', label: 'Activa' },
                      { value: 'completed', label: 'Completada' },
                      { value: 'cancelled', label: 'Cancelada' }
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Propósito / Descripción</label>
                  <textarea
                    value={isCreate ? form.description : editForm.description}
                    onChange={e => isCreate ? setForm({...form, description: e.target.value}) : setEditForm({...editForm, description: e.target.value})}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-medium focus:outline-none focus:border-emerald-500/50 transition-all text-sm"
                    rows={3}
                    placeholder="Describe por qué es importante esta meta..."
                  />
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
                  className="flex-[2] px-8 py-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-xl hover:shadow-emerald-500/20 transition-all disabled:opacity-50"
                >
                  {saving ? 'Procesando...' : isCreate ? 'Establecer Objetivo' : 'Actualizar Misión'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default GoalFormModal;

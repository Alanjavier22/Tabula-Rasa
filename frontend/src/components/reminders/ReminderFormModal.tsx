import type { Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import type { ReminderFrequency, ReminderStatus } from '../../types';
import Select from '../common/Select';
import DatePicker from '../common/DatePicker';

export interface ReminderFormData {
  name: string;
  amount: string;
  due_date: string;
  frequency: ReminderFrequency;
  description: string;
  status: ReminderStatus;
  is_active: boolean;
}

interface ReminderFormModalProps {
  isCreate: boolean;
  isOpen: boolean;
  form: ReminderFormData;
  setForm: Dispatch<SetStateAction<ReminderFormData>>;
  editForm: ReminderFormData;
  setEditForm: Dispatch<SetStateAction<ReminderFormData>>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const ReminderFormModal = ({ isCreate, isOpen, form, setForm, editForm, setEditForm, saving, onClose, onSubmit }: ReminderFormModalProps) => {
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
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 text-orange-400">
                  <Bell className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    {isCreate ? 'Nueva Alerta' : 'Editar Recordatorio'}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Planificación de Tareas</p>
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
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Título del Recordatorio</label>
                  <input
                    type="text"
                    required
                    value={isCreate ? form.name : editForm.name}
                    onChange={e => isCreate ? setForm({...form, name: e.target.value}) : setEditForm({...editForm, name: e.target.value})}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-bold focus:outline-none focus:border-orange-500/50 transition-all text-lg"
                    placeholder="Ej: Pago de Internet, Revisión Técnica..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Monto (Opcional)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={isCreate ? form.amount : editForm.amount}
                      onChange={e => isCreate ? setForm({...form, amount: e.target.value}) : setEditForm({...editForm, amount: e.target.value})}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-black focus:outline-none focus:border-orange-500/50 transition-all text-2xl"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Fecha Límite</label>
                    <DatePicker
                      value={isCreate ? form.due_date : editForm.due_date}
                      onChange={(value) => isCreate ? setForm({...form, due_date: value}) : setEditForm({...editForm, due_date: value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Ciclo de Repetición</label>
                    <Select
                      value={isCreate ? form.frequency : editForm.frequency}
                      onChange={(value) => isCreate ? setForm({...form, frequency: value as ReminderFrequency}) : setEditForm({...editForm, frequency: value as ReminderFrequency})}
                      options={[
                        { value: 'once', label: 'Una vez' },
                        { value: 'daily', label: 'Diario' },
                        { value: 'weekly', label: 'Semanal' },
                        { value: 'monthly', label: 'Mensual' },
                        { value: 'yearly', label: 'Anual' }
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Estado Inicial</label>
                    <Select
                      value={isCreate ? form.status : editForm.status}
                      onChange={(value) => isCreate ? setForm({...form, status: value as ReminderStatus}) : setEditForm({...editForm, status: value as ReminderStatus})}
                      options={[
                        { value: 'pending', label: 'Pendiente' },
                        { value: 'completed', label: 'Completado' },
                        { value: 'skipped', label: 'Omitido' }
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Notas Adicionales</label>
                  <textarea
                    value={isCreate ? form.description : editForm.description}
                    onChange={e => isCreate ? setForm({...form, description: e.target.value}) : setEditForm({...editForm, description: e.target.value})}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-medium focus:outline-none focus:border-orange-500/50 transition-all text-sm"
                    rows={3}
                    placeholder="Agrega detalles del pago o enlace a la factura..."
                  />
                </div>

                <div className="flex items-center gap-4 px-4 py-2">
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      id="isActiveToggle"
                      checked={isCreate ? form.is_active : editForm.is_active}
                      onChange={e => isCreate ? setForm({...form, is_active: e.target.checked}) : setEditForm({...editForm, is_active: e.target.checked})}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                    <span className="ml-3 text-xs font-black text-slate-300 uppercase tracking-widest cursor-pointer select-none">Recordatorio Activo</span>
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
                  className="flex-[2] px-8 py-5 rounded-2xl bg-gradient-to-r from-orange-600 to-rose-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-xl hover:shadow-orange-500/20 transition-all disabled:opacity-50"
                >
                  {saving ? 'Procesando...' : isCreate ? 'Crear Alerta' : 'Actualizar Alerta'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ReminderFormModal;

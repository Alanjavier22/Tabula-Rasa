import Modal from '../common/Modal';
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
  const submitLabel = isCreate ? 'Crear Alerta' : 'Actualizar Alerta';

  return (
    <AnimatePresence>
      {isOpen && (
        <Modal onClose={onClose} label={'Recordatorio'}>
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
            <div className="p-6 md:p-10 border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-warning-soft flex items-center justify-center border border-line text-warning">
                  <Bell className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-primary tracking-tight">
                    {isCreate ? 'Nueva Alerta' : 'Editar Recordatorio'}
                  </h2>
                  <p className="text-xs text-muted font-bold tracking-widest uppercase">Planificación de Tareas</p>
                </div>
              </div>
              <button aria-label="Cerrar diálogo"
                onClick={onClose}
                className="w-10 h-10 md:w-12 md:h-12 rounded-2xl hover:bg-surface-soft flex items-center justify-center text-muted hover:text-primary transition-all"
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
                  <label htmlFor="reminder-name" className="block text-xs font-black text-muted uppercase tracking-widest mb-3 ml-1">Título del Recordatorio</label>
                  <input
                    id="reminder-name"
                    type="text"
                    required
                    value={isCreate ? form.name : editForm.name}
                    onChange={e => isCreate ? setForm({...form, name: e.target.value}) : setEditForm({...editForm, name: e.target.value})}
                    className="w-full bg-surface-soft border border-line rounded-2xl px-6 py-5 text-primary font-bold focus:outline-none focus:border-line transition-all text-lg"
                    placeholder="Ej: Pago de Internet, Revisión Técnica..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="reminder-amount" className="block text-xs font-black text-muted uppercase tracking-widest mb-3 ml-1">Monto (Opcional)</label>
                    <input
                      id="reminder-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={isCreate ? form.amount : editForm.amount}
                      onChange={e => isCreate ? setForm({...form, amount: e.target.value}) : setEditForm({...editForm, amount: e.target.value})}
                      className="w-full bg-surface-soft border border-line rounded-2xl px-6 py-5 text-primary font-black focus:outline-none focus:border-line transition-all text-2xl"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="reminder-due-date" className="block text-xs font-black text-muted uppercase tracking-widest mb-3 ml-1">Fecha Límite</label>
                    <DatePicker
                      id="reminder-due-date"
                      value={isCreate ? form.due_date : editForm.due_date}
                      onChange={(value) => isCreate ? setForm({...form, due_date: value}) : setEditForm({...editForm, due_date: value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="reminder-frequency" className="block text-xs font-black text-muted uppercase tracking-widest mb-3 ml-1">Ciclo de Repetición</label>
                    <Select
                      id="reminder-frequency"
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
                    <label htmlFor="reminder-status" className="block text-xs font-black text-muted uppercase tracking-widest mb-3 ml-1">Estado Inicial</label>
                    <Select
                      id="reminder-status"
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
                  <label htmlFor="reminder-description" className="block text-xs font-black text-muted uppercase tracking-widest mb-3 ml-1">Notas Adicionales</label>
                  <textarea
                    id="reminder-description"
                    value={isCreate ? form.description : editForm.description}
                    onChange={e => isCreate ? setForm({...form, description: e.target.value}) : setEditForm({...editForm, description: e.target.value})}
                    className="w-full bg-surface-soft border border-line rounded-2xl px-6 py-5 text-primary font-medium focus:outline-none focus:border-line transition-all text-sm"
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
                    <div className="w-11 h-6 bg-surface peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-line after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-soft after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-warning"></div>
                    <span className="ml-3 text-xs font-black text-muted uppercase tracking-widest cursor-pointer select-none">Recordatorio Activo</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-8 py-5 rounded-2xl bg-surface-soft border border-line text-primary text-xs font-black uppercase tracking-widest hover:bg-surface-soft transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-[2] px-8 py-5 rounded-2xl bg-surface-soft   text-primary text-xs font-black uppercase tracking-widest hover:shadow-xl  transition-all disabled:opacity-50"
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

export default ReminderFormModal;

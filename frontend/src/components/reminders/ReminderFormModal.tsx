import FormModalFrame from '../common/FormModalFrame';

import type { Dispatch, SetStateAction } from 'react';

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
    <FormModalFrame isOpen={isOpen} onClose={onClose} label="Recordatorio">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-warning-soft flex items-center justify-center border border-line text-warning">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-primary tracking-tight">
                    {isCreate ? 'Nueva Alerta' : 'Editar Recordatorio'}
                  </h2>
                  <p className="text-[11px] text-muted font-bold tracking-wider uppercase">Planificación de Compromisos</p>
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
                  <label htmlFor="reminder-name" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                    Título del Recordatorio
                  </label>
                  <input
                    id="reminder-name"
                    type="text"
                    required
                    value={isCreate ? form.name : editForm.name}
                    onChange={e => isCreate ? setForm({ ...form, name: e.target.value }) : setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-semibold focus:outline-none focus:border-line transition-all text-sm"
                    placeholder="Ej: Pago de Internet, Revisión Técnica..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reminder-amount" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Monto Estimado (Opcional)
                    </label>
                    <input
                      id="reminder-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={isCreate ? form.amount : editForm.amount}
                      onChange={e => isCreate ? setForm({ ...form, amount: e.target.value }) : setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-bold tabular-nums focus:outline-none focus:border-line transition-all text-base"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="reminder-due-date" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Fecha Límite
                    </label>
                    <DatePicker
                      id="reminder-due-date"
                      value={isCreate ? form.due_date : editForm.due_date}
                      onChange={(value) => isCreate ? setForm({ ...form, due_date: value }) : setEditForm({ ...editForm, due_date: value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reminder-frequency" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Ciclo de Repetición
                    </label>
                    <Select
                      id="reminder-frequency"
                      value={isCreate ? form.frequency : editForm.frequency}
                      onChange={(value) => isCreate ? setForm({ ...form, frequency: value as ReminderFrequency }) : setEditForm({ ...editForm, frequency: value as ReminderFrequency })}
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
                    <label htmlFor="reminder-status" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Estado
                    </label>
                    <Select
                      id="reminder-status"
                      value={isCreate ? form.status : editForm.status}
                      onChange={(value) => isCreate ? setForm({ ...form, status: value as ReminderStatus }) : setEditForm({ ...editForm, status: value as ReminderStatus })}
                      options={[
                        { value: 'pending', label: 'Pendiente' },
                        { value: 'completed', label: 'Completado' },
                        { value: 'skipped', label: 'Omitido' }
                      ]}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reminder-description" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                    Notas Adicionales
                  </label>
                  <textarea
                    id="reminder-description"
                    value={isCreate ? form.description : editForm.description}
                    onChange={e => isCreate ? setForm({ ...form, description: e.target.value }) : setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-medium focus:outline-none focus:border-line transition-all text-sm"
                    rows={2}
                    placeholder="Agrega detalles del pago o referencia..."
                  />
                </div>

                <label htmlFor="isActiveToggle" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-soft border border-line cursor-pointer">
                  <input
                    type="checkbox"
                    id="isActiveToggle"
                    checked={isCreate ? form.is_active : editForm.is_active}
                    onChange={e => isCreate ? setForm({ ...form, is_active: e.target.checked }) : setEditForm({ ...editForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded border-line text-warning focus:ring-warning"
                  />
                  <span className="text-xs font-semibold text-primary select-none">Recordatorio activo</span>
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
          </FormModalFrame>
  );
};

export default ReminderFormModal;

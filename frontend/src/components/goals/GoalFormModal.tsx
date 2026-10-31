import FormModalFrame from '../common/FormModalFrame';

import type { Dispatch, SetStateAction } from 'react';

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
  const submitLabel = isCreate ? 'Establecer Objetivo' : 'Actualizar Meta';

  return (
    <FormModalFrame isOpen={isOpen} onClose={onClose} label="Meta financiera">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-success-soft flex items-center justify-center border border-line text-success">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-primary tracking-tight">
                    {isCreate ? 'Nuevo Objetivo' : 'Ajustar Meta'}
                  </h2>
                  <p className="text-[11px] text-muted font-bold tracking-wider uppercase">Parámetros de Crecimiento</p>
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
                  <label htmlFor="goal-name" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                    Nombre de la Meta
                  </label>
                  <input
                    id="goal-name"
                    type="text"
                    required
                    value={isCreate ? form.name : editForm.name}
                    onChange={e => isCreate ? setForm({ ...form, name: e.target.value }) : setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-semibold focus:outline-none focus:border-line transition-all text-sm"
                    placeholder="Ej: Nuevo Auto, Fondo de Emergencia..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="goal-target-amount" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Capital Objetivo ($)
                    </label>
                    <input
                      id="goal-target-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={isCreate ? form.target_amount : editForm.target_amount}
                      onChange={e => isCreate ? setForm({ ...form, target_amount: e.target.value }) : setEditForm({ ...editForm, target_amount: e.target.value })}
                      className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-bold tabular-nums focus:outline-none focus:border-line transition-all text-base"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="goal-target-date" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                      Fecha Límite
                    </label>
                    <DatePicker
                      id="goal-target-date"
                      value={isCreate ? form.target_date : editForm.target_date}
                      onChange={(value) => isCreate ? setForm({ ...form, target_date: value }) : setEditForm({ ...editForm, target_date: value })}
                      placeholder="Elegir fecha"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="goal-status" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                    Estado de la Meta
                  </label>
                  <Select
                    id="goal-status"
                    value={isCreate ? form.status : editForm.status}
                    onChange={(value) => isCreate ? setForm({ ...form, status: value as GoalStatus }) : setEditForm({ ...editForm, status: value as GoalStatus })}
                    options={[
                      { value: 'active', label: 'Activa' },
                      { value: 'completed', label: 'Completada' },
                      { value: 'cancelled', label: 'Cancelada' }
                    ]}
                  />
                </div>

                <div>
                  <label htmlFor="goal-description" className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5 ml-0.5">
                    Propósito / Descripción
                  </label>
                  <textarea
                    id="goal-description"
                    value={isCreate ? form.description : editForm.description}
                    onChange={e => isCreate ? setForm({ ...form, description: e.target.value }) : setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full bg-surface-soft border border-line rounded-xl px-4 py-3 text-primary font-medium focus:outline-none focus:border-line transition-all text-sm"
                    rows={2}
                    placeholder="Describe por qué es importante esta meta..."
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
                  {saving ? 'Procesando...' : submitLabel}
                </button>
              </div>
            </form>
          </FormModalFrame>
  );
};

export default GoalFormModal;

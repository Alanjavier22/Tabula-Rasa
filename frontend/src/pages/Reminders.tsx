import { useEffect, useState } from 'react';
import { remindersAPI } from '../services/api';
import type { Reminder } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { Plus, Trash2, Edit, Bell, CheckCircle2, Clock, Calendar, X } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  name: '',
  amount: '',
  due_date: new Date().toISOString().split('T')[0],
  frequency: 'once',
  description: '',
  status: 'pending',
  is_active: true,
};

const Reminders = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    try {
      const response = await remindersAPI.getAll();
      setReminders(response.data);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    try {
      await remindersAPI.delete(deleteConfirm.id);
      setToast({ message: 'Recordatorio eliminado', type: 'success' });
      fetchReminders();
    } catch (error: any) {
      console.error('Error deleting reminder:', error);
      setToast({ message: error.response?.data?.detail || 'Error al eliminar recordatorio', type: 'error' });
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setEditForm({
      name: reminder.name,
      // Backend returns cents, divide by 100 for display
      amount: reminder.amount ? (reminder.amount / 100).toString() : '',
      due_date: reminder.due_date.split('T')[0],
      frequency: reminder.frequency,
      description: reminder.description || '',
      status: reminder.status,
      is_active: reminder.is_active,
    });
    setShowEditModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await remindersAPI.create({
        name: form.name,
        // Convert user input (dollars) to cents for backend
        amount: form.amount ? toCents(form.amount) : null,
        due_date: form.due_date + 'T00:00:00',
        frequency: form.frequency,
        description: form.description || null,
        status: form.status,
        is_active: form.is_active ? 1 : 0,
      });
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Recordatorio creado', type: 'success' });
      fetchReminders();
    } catch (error: any) {
      console.error('Error creating reminder:', error);
      setToast({ message: error.response?.data?.detail || 'Error al crear recordatorio', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReminder) return;
    setSaving(true);
    try {
      await remindersAPI.update(editingReminder.id, {
        name: editForm.name,
        // Convert user input (dollars) to cents for backend
        amount: editForm.amount ? toCents(editForm.amount) : null,
        due_date: editForm.due_date + 'T00:00:00',
        frequency: editForm.frequency,
        description: editForm.description || null,
        status: editForm.status,
        is_active: editForm.is_active ? 1 : 0,
      });
      setShowEditModal(false);
      setEditingReminder(null);
      setEditForm(emptyForm);
      setToast({ message: 'Recordatorio actualizado', type: 'success' });
      fetchReminders();
    } catch (error: any) {
      console.error('Error updating reminder:', error);
      setToast({ message: error.response?.data?.detail || 'Error al actualizar recordatorio', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkComplete = async (id: string) => {
    try {
      await remindersAPI.update(id, { status: 'completed' });
      setToast({ message: 'Recordatorio marcado como completado', type: 'success' });
      fetchReminders();
    } catch (error: any) {
      console.error('Error marking reminder as complete:', error);
      setToast({ message: error.response?.data?.detail || 'Error al actualizar recordatorio', type: 'error' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400';
      case 'skipped':
        return 'bg-slate-700 text-slate-400';
      default:
        return 'bg-orange-500/20 text-orange-400';
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'daily':
        return 'Diario';
      case 'weekly':
        return 'Semanal';
      case 'monthly':
        return 'Mensual';
      case 'yearly':
        return 'Anual';
      default:
        return 'Una vez';
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 lg:mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Recordatorios</h1>
          <p className="text-slate-300 text-sm lg:text-base">Gestiona recordatorios de pagos y fechas de vencimiento</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap">
          <Plus className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
          Agregar Recordatorio
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reminders.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-slate-400 text-lg">No hay recordatorios configurados</p>
            <p className="text-slate-500 text-sm mt-2">Agrega recordatorios para pagos próximos</p>
          </div>
        ) : (
          reminders.map((reminder) => (
            <div
              key={reminder.id}
              className={`bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 hover:border-purple-500/50 transition-all duration-300 ${
                !reminder.is_active ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="bg-orange-500/20 p-3 rounded-full mr-3">
                    <Bell className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{reminder.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(reminder.status)}`}>
                      {reminder.status === 'pending' ? 'Pendiente' : reminder.status === 'completed' ? 'Completado' : 'Omitido'}
                    </span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  {reminder.status === 'pending' && (
                    <button
                      onClick={() => handleMarkComplete(reminder.id)}
                      className="text-green-400 hover:text-green-300"
                      title="Marcar como completo"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => handleEdit(reminder)} className="text-blue-400 hover:text-blue-300">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-sm text-slate-300">
                  <Calendar className="w-4 h-4 mr-2" />
                  <span>Vencimiento: {new Date(reminder.due_date).toLocaleDateString('es-ES')}</span>
                </div>

                <div className="flex items-center text-sm text-slate-300">
                  <Clock className="w-4 h-4 mr-2" />
                  <span>Frecuencia: {getFrequencyLabel(reminder.frequency)}</span>
                </div>

                {reminder.amount && (
                  <div>
                    <span className="text-slate-400">Monto: </span>
                    <span className="font-semibold text-white">${formatMoney(reminder.amount)}</span>
                  </div>
                )}

                {reminder.description && (
                  <p className="text-sm text-slate-400 mt-2">{reminder.description}</p>
                )}

                {!reminder.is_active && (
                  <span className="text-xs text-slate-500">Inactivo</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Nuevo Recordatorio</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="Ej: Pago de alquiler"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={e => setForm({...form, amount: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Fecha Vencimiento *</label>
                  <input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={e => setForm({...form, due_date: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Frecuencia</label>
                <select
                  value={form.frequency}
                  onChange={e => setForm({...form, frequency: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="once">Una vez</option>
                  <option value="daily">Diario</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Estado</label>
                <select
                  value={form.status}
                  onChange={e => setForm({...form, status: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="pending">Pendiente</option>
                  <option value="completed">Completado</option>
                  <option value="skipped">Omitido</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  rows={2}
                  placeholder="Opcional"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.is_active}
                  onChange={e => setForm({...form, is_active: e.target.checked})}
                  className="rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="isActive" className="text-sm text-slate-300">Recordatorio activo</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingReminder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Editar Recordatorio</h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.amount}
                    onChange={e => setEditForm({...editForm, amount: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Fecha Vencimiento *</label>
                  <input
                    type="date"
                    required
                    value={editForm.due_date}
                    onChange={e => setEditForm({...editForm, due_date: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Frecuencia</label>
                <select
                  value={editForm.frequency}
                  onChange={e => setEditForm({...editForm, frequency: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="once">Una vez</option>
                  <option value="daily">Diario</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Estado</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm({...editForm, status: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="pending">Pendiente</option>
                  <option value="completed">Completado</option>
                  <option value="skipped">Omitido</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Descripción</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm({...editForm, description: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editForm.is_active}
                  onChange={e => setEditForm({...editForm, is_active: e.target.checked})}
                  className="rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="editIsActive" className="text-sm text-slate-300">Recordatorio activo</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 text-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Eliminar Recordatorio"
        message="¿Estás seguro de que quieres eliminar este recordatorio? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Reminders;

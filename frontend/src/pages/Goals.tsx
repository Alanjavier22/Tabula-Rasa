import { useEffect, useState } from 'react';
import { goalsAPI } from '../services/api';
import type { Goal } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { Plus, Trash2, Edit, Target, CheckCircle2, Clock, XCircle, X } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  name: '',
  target_amount: '',
  current_amount: '0',
  target_date: '',
  description: '',
  status: 'active',
};

const Goals = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      const response = await goalsAPI.getAll();
      setGoals(response.data);
    } catch (error) {
      console.error('Error fetching goals:', error);
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
      await goalsAPI.delete(deleteConfirm.id);
      setToast({ message: 'Meta eliminada', type: 'success' });
      fetchGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
      setToast({ message: 'Error al eliminar meta', type: 'error' });
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setEditForm({
      name: goal.name,
      // Backend returns cents, divide by 100 for display
      target_amount: (goal.target_amount / 100).toString(),
      current_amount: (goal.current_amount / 100).toString(),
      target_date: goal.target_date ? goal.target_date.split('T')[0] : '',
      description: goal.description || '',
      status: goal.status,
    });
    setShowEditModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await goalsAPI.create({
        name: form.name,
        // Convert user input (dollars) to cents for backend
        target_amount: toCents(form.target_amount),
        current_amount: toCents(form.current_amount),
        target_date: form.target_date ? form.target_date + 'T00:00:00' : null,
        description: form.description || null,
        status: form.status,
      });
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Meta creada', type: 'success' });
      fetchGoals();
    } catch (error) {
      console.error('Error creating goal:', error);
      setToast({ message: 'Error al crear meta', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal) return;
    setSaving(true);
    try {
      await goalsAPI.update(editingGoal.id, {
        name: editForm.name,
        // Convert user input (dollars) to cents for backend
        target_amount: toCents(editForm.target_amount),
        current_amount: toCents(editForm.current_amount),
        target_date: editForm.target_date ? editForm.target_date + 'T00:00:00' : null,
        description: editForm.description || null,
        status: editForm.status,
      });
      setShowEditModal(false);
      setEditingGoal(null);
      setEditForm(emptyForm);
      setToast({ message: 'Meta actualizada', type: 'success' });
      fetchGoals();
    } catch (error) {
      console.error('Error updating goal:', error);
      setToast({ message: 'Error al actualizar meta', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-blue-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-400';
      case 'cancelled':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-blue-500/20 text-blue-400';
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 lg:mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Metas</h1>
          <p className="text-slate-300 text-sm lg:text-base">Rastrea tus metas de ahorro</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap">
          <Plus className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
          Agregar Meta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {goals.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-slate-400 text-lg">No hay metas establecidas</p>
            <p className="text-slate-500 text-sm mt-2">Establece metas de ahorro para rastrear tu progreso</p>
          </div>
        ) : (
          goals.map((goal) => {
            const percentage = (goal.current_amount / goal.target_amount) * 100;
            const remaining = goal.target_amount - goal.current_amount;

            return (
              <div
                key={goal.id}
                className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 hover:border-purple-500/50 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="bg-green-500/20 p-3 rounded-full mr-3">
                      <Target className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{goal.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(goal.status)}`}>
                        {goal.status === 'completed' ? 'Completada' : goal.status === 'cancelled' ? 'Cancelada' : 'Activa'}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => handleEdit(goal)} className="text-blue-400 hover:text-blue-300">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-slate-400">Progreso</span>
                    <span className="text-sm font-semibold text-white">
                      ${formatMoney(goal.current_amount)} / ${formatMoney(goal.target_amount)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-green-600 to-green-400 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-slate-400">{percentage.toFixed(0)}%</span>
                    <span className="text-xs font-semibold text-green-400">
                      ${formatMoney(remaining)} por lograr
                    </span>
                  </div>
                </div>

                {goal.target_date && (
                  <div className="flex items-center text-sm text-slate-400 mt-3">
                    {getStatusIcon(goal.status)}
                    <span className="ml-2">
                      Objetivo: {new Date(goal.target_date).toLocaleDateString('es-ES')}
                    </span>
                  </div>
                )}

                {goal.description && (
                  <p className="text-sm text-slate-400 mt-3">{goal.description}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Nueva Meta</h2>
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
                  placeholder="Ej: Vacación"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Monto Objetivo *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={form.target_amount}
                    onChange={e => setForm({...form, target_amount: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Monto Actual</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.current_amount}
                    onChange={e => setForm({...form, current_amount: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Fecha Objetivo</label>
                <input
                  type="date"
                  value={form.target_date}
                  onChange={e => setForm({...form, target_date: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Estado</label>
                <select
                  value={form.status}
                  onChange={e => setForm({...form, status: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="active">Activa</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
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
      {showEditModal && editingGoal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Editar Meta</h2>
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
                  <label className="block text-sm text-slate-300 mb-1">Monto Objetivo *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editForm.target_amount}
                    onChange={e => setEditForm({...editForm, target_amount: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Monto Actual</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.current_amount}
                    onChange={e => setEditForm({...editForm, current_amount: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Fecha Objetivo</label>
                <input
                  type="date"
                  value={editForm.target_date}
                  onChange={e => setEditForm({...editForm, target_date: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Estado</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm({...editForm, status: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="active">Activa</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
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
        title="Eliminar Meta"
        message="¿Estás seguro de que quieres eliminar esta meta? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Goals;

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { goalsAPI, aiGoalsAPI } from '../services/api';
import type { Goal, GoalStatus, SmartGoalResponse } from '../types';
import { formatMoney, toCents } from '../utils/money';
import {
  Plus,
  Trash2,
  Edit,
  Target,
  CheckCircle2,
  X,
  Sparkles,
  Loader2,
  ArrowRight,
  Calendar,
  Zap,
  Info
} from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import GoalFormModal, { type GoalFormData } from '../components/goals/GoalFormModal';

const emptyForm: GoalFormData = {
  name: '',
  target_amount: '',
  target_date: '',
  description: '',
  status: 'active' as GoalStatus,
};

const getGoalStatusClass = (status: GoalStatus) => {
  if (status === 'completed') return 'bg-success-soft border-line text-success';
  if (status === 'cancelled') return 'bg-danger-soft border-line text-danger';
  return 'bg-info-soft border-line text-info';
};

const getGoalStatusLabel = (status: GoalStatus) => {
  if (status === 'completed') return 'Completada';
  if (status === 'cancelled') return 'Cancelada';
  return 'En Progreso';
};

const Goals = () => {
  const queryClient = useQueryClient();
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

  // Bloquear scroll del body cuando el modal está abierto


  // AI Recommendations State
  const [smartRecommendations, setSmartRecommendations] = useState<SmartGoalResponse | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  const fetchGoals = async () => {
    try {
      const response = await goalsAPI.getAll();
      setGoals(response.data);
    } catch (error) {
      console.error('Error fetching goals:', error);
      setToast({ message: 'No se pudieron cargar las metas', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchGoals);
  }, []);

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    try {
      await goalsAPI.delete(deleteConfirm.id);
      setToast({ message: 'Meta eliminada del sistema', type: 'success' });
      fetchGoals();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    } catch (error) {
      console.error('Error deleting goal:', error);
      setToast({ message: 'Error al eliminar meta', type: 'error' });
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleFetchRecommendations = async () => {
    setLoadingRecommendations(true);
    try {
      const response = await aiGoalsAPI.getSmartRecommendations();
      setSmartRecommendations(response.data);
      setToast({ message: 'Consejero de IA activado', type: 'success' });
    } catch (error) {
      console.error('Error fetching smart recommendations:', error);
      setToast({ message: 'Error al sincronizar con la IA', type: 'error' });
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setEditForm({
      name: goal.name,
      target_amount: (goal.target_amount / 100).toString(),
      target_date: goal.target_date ? goal.target_date.substring(0, 10) : '',
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
        target_amount: toCents(form.target_amount),
        target_date: form.target_date ? form.target_date + 'T00:00:00' : null,
        description: form.description || null,
        status: form.status,
      });
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Nueva meta establecida con éxito', type: 'success' });
      fetchGoals();
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    } catch (error) {
      console.error('Error creating goal:', error);
      setToast({ message: 'Error al establecer meta', type: 'error' });
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
        target_amount: toCents(editForm.target_amount),
        target_date: editForm.target_date ? editForm.target_date + 'T00:00:00' : null,
        description: editForm.description || null,
        status: editForm.status,
      });
      setShowEditModal(false);
      setEditingGoal(null);
      setEditForm(emptyForm);
      setToast({ message: 'Meta actualizada correctamente', type: 'success' });
      fetchGoals();
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    } catch (error) {
      console.error('Error updating goal:', error);
      setToast({ message: 'Error al actualizar meta', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Aggregated Stats
  const totalTarget = goals.reduce((acc, g) => acc + g.target_amount, 0);
  const totalSaved = goals.reduce((acc, g) => acc + g.current_amount, 0);
  const globalProgress = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;
  const activeGoalsCount = goals.filter(g => g.status === 'active').length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-primary">
        <Loader2 className="w-10 h-10 animate-spin text-success mb-4" />
        <p className="text-muted font-medium animate-pulse">Sincronizando metas financieras...</p>
      </div>
    );
  }

  return (
    <div className="goals-page compact-page w-full relative min-h-screen pb-20">
      {/* Background Decor */}


      <div className="compact-page-content relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="compact-page-header flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>

            <h1 className="text-4xl lg:text-5xl font-black text-primary tracking-tight">Metas</h1>
            <p className="text-muted text-sm lg:text-base font-medium mt-2 max-w-md">
              Visualiza tu crecimiento y acelera el camino hacia tus metas con asistencia de IA.
            </p>
          </motion.div>

          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            className="compact-page-actions flex flex-wrap gap-3"
          >
            <button
              onClick={handleFetchRecommendations}
              disabled={loadingRecommendations}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface-soft hover:bg-surface-soft border border-line text-primary transition-all group disabled:opacity-50"
            >
              {loadingRecommendations ? (
                <Loader2 className="w-4 h-4 animate-spin text-success" />
              ) : (
                <Sparkles className="w-4 h-4 text-success group-hover:scale-125 transition-transform" />
              )}
              <span className="text-xs font-black uppercase tracking-widest">Consejero IA</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="app-btn app-btn-primary"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Nueva Meta</span>
            </button>
          </motion.div>
        </div>

        {/* Global Progress Summary */}
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="compact-summary grid grid-cols-1 md:grid-cols-4 gap-6 mb-12"
        >
          <div className="compact-summary-card md:col-span-2 bg-surface  p-8 rounded-2xl border border-line flex flex-col justify-center">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Ahorro Total Acumulado</p>
                <p className="text-3xl font-black text-primary tracking-tight">${formatMoney(totalSaved)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Progreso Global</p>
                <p className="text-lg font-black text-success">{globalProgress.toFixed(1)}%</p>
              </div>
            </div>
            <div className="w-full bg-surface-soft rounded-full h-3 overflow-hidden">
              <motion.div
                initial={false}
                animate={{ width: `${Math.min(globalProgress, 100)}%` }}
                className="h-full rounded-full bg-success   "
              />
            </div>
          </div>

          <div className="compact-summary-card bg-surface  p-6 rounded-2xl border border-line flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-info-soft flex items-center justify-center border border-line text-info">
              <Target className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Metas Activas</p>
              <p className="text-2xl font-black text-primary">{activeGoalsCount}</p>
            </div>
          </div>

          <div className="compact-summary-card bg-surface  p-6 rounded-2xl border border-line flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center border border-line text-accent-strong">
              <Zap className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Objetivo Final</p>
              <p className="text-2xl font-black text-primary">${formatMoney(totalTarget)}</p>
            </div>
          </div>
        </motion.div>

        {/* AI Recommendations Panel */}
        <AnimatePresence>
          {smartRecommendations && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, height: 'auto', marginBottom: 48 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="compact-panel bg-surface-soft   border border-line rounded-2xl p-8  relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-6">
                <button onClick={() => setSmartRecommendations(null)} className="w-10 h-10 rounded-xl bg-surface-soft hover:bg-surface-soft flex items-center justify-center text-success hover:text-primary transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-success-soft flex items-center justify-center border border-line">
                  <Sparkles className="w-6 h-6 text-success" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-success tracking-tight">Análisis del Consejero IA</h2>
                  <p className="text-xs text-success font-bold uppercase tracking-widest">Recomendaciones Estratégicas</p>
                </div>
              </div>

              <div className="bg-surface-soft rounded-3xl p-6 border border-line mb-8">
                <p className="text-primary leading-relaxed font-medium italic">"{smartRecommendations.summary_message}"</p>
              </div>

              {smartRecommendations.recommendations.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {smartRecommendations.recommendations.map((rec, idx) => (
                    <motion.div
                      key={rec.goal_id}
                      initial={false}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="compact-card-mini bg-canvas border border-line rounded-2xl p-6 hover:border-line transition-all"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-sm font-black text-primary uppercase tracking-tight">{rec.goal_name}</span>
                        <div className="px-3 py-1 bg-success-soft rounded-lg text-success text-xs font-black">
                          +${formatMoney(rec.suggested_transfer_cents)}
                        </div>
                      </div>
                      <div className="flex gap-3 items-start">
                        <div className="mt-1 p-1 rounded bg-success-soft text-success">
                          <ArrowRight className="w-3 h-3" />
                        </div>
                        <p className="text-xs text-muted font-medium leading-relaxed">
                          {rec.reasoning}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Goals Grid */}
        <div className="compact-page-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {goals.length === 0 ? (
              <motion.div
                className="compact-empty col-span-full py-32 flex flex-col items-center text-center bg-surface-soft rounded-2xl border border-dashed border-line"
                initial={false}
                animate={{ opacity: 1 }}
              >
                <div className="w-24 h-24 rounded-full bg-surface flex items-center justify-center mb-8">
                  <Target className="w-12 h-12 text-muted" />
                </div>
                <h3 className="text-2xl font-bold text-primary mb-3">Tu futuro financiero empieza aquí</h3>
                <p className="text-muted max-w-sm leading-relaxed font-medium">
                  Establece tu primera meta de ahorro y deja que el sistema te ayude a materializarla.
                </p>
                <button type="button" className="app-btn app-btn-primary mt-5" onClick={() => setShowCreateModal(true)}>Crear primera meta</button>
              </motion.div>
            ) : (
              goals.map((goal, index) => {
                const percentage = (goal.current_amount / goal.target_amount) * 100;
                const remaining = goal.target_amount - goal.current_amount;
                const isCompleted = goal.status === 'completed';

                return (
                  <motion.div
                    key={goal.id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className="compact-card group bg-surface  rounded-2xl border border-line hover:border-line transition-all p-8 relative overflow-hidden"
                  >
                    {/* Progress Background Decor */}
                    <motion.div
                      initial={false}
                      animate={{ scaleX: Math.min(percentage, 100) / 100 }}
                      style={{ originX: 0 }}
                      className={`absolute bottom-0 left-0 right-0 h-1 transition-all duration-1000 ${
                        isCompleted ? 'bg-success' : 'bg-info'
                      }`}
                    />

                    <div className="flex items-start justify-between mb-8 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${
                          isCompleted
                            ? 'bg-success-soft border-line text-success'
                            : 'bg-surface-soft border-line text-muted group-hover:text-info'
                        }`}>
                          {isCompleted ? <CheckCircle2 className="w-8 h-8" /> : <Target className="w-8 h-8" />}
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-primary tracking-tight leading-tight">{goal.name}</h3>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-widest border ${getGoalStatusClass(goal.status)}`}>
                              {getGoalStatusLabel(goal.status)}
                            </span>
                            {goal.target_date && (
                              <div className="flex items-center gap-1 text-xs font-bold text-muted uppercase tracking-widest">
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(goal.target_date).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEdit(goal)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface-soft text-muted hover:text-primary transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-danger-soft text-muted hover:text-danger transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                      <div>
                        <div className="flex justify-between items-end mb-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-muted uppercase tracking-widest mb-1">Ahorro Actual</span>
                            <span className="text-2xl font-black text-primary tracking-tight">${formatMoney(goal.current_amount)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-muted uppercase tracking-widest mb-1">Meta Final</span>
                            <span className="text-sm font-black text-muted">${formatMoney(goal.target_amount)}</span>
                          </div>
                        </div>

                        {/* Progress Meter */}
                        <div className="relative h-3 w-full bg-surface-soft rounded-full overflow-hidden border border-line p-0.5">
                          <motion.div
                            initial={false}
                            animate={{ width: `${Math.min(percentage, 100)}%` }}
                            className={`h-full rounded-full transition-all duration-1000 ${
                              isCompleted
                                ? 'bg-success'
                                : 'bg-info'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${percentage > 90 ? 'bg-success animate-pulse' : 'bg-info'}`}></div>
                          <span className="text-xs font-black text-primary tracking-tight">{percentage.toFixed(0)}% Alcanzado</span>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-muted uppercase tracking-widest mb-0.5">Faltante</p>
                          <p className="text-sm font-black text-success tracking-tight">${formatMoney(Math.max(0, remaining))}</p>
                        </div>
                      </div>

                      {goal.description && (
                        <div className="pt-4 border-t border-line">
                          <div className="flex gap-2 items-start opacity-60">
                            <Info className="w-3 h-3 text-muted shrink-0 mt-0.5" />
                            <p className="text-xs font-medium text-muted leading-relaxed italic line-clamp-2">
                              {goal.description}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      <GoalFormModal
        isCreate={showCreateModal}
        isOpen={showCreateModal || showEditModal}
        form={form}
        setForm={setForm}
        editForm={editForm}
        setEditForm={setEditForm}
        saving={saving}
        onClose={() => {
          setShowCreateModal(false);
          setShowEditModal(false);
        }}
        onSubmit={showCreateModal ? handleCreateSubmit : handleEditSubmit}
      />
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Eliminar Meta Financiera"
        message="¿Estás seguro de que quieres eliminar esta meta? Perderás el registro de progreso acumulado hacia este objetivo."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Goals;

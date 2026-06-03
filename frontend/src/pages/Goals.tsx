import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { goalsAPI, aiGoalsAPI } from '../services/api';
import type { Goal, GoalStatus } from '../types';
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
import Select from '../components/common/Select';
import DatePicker from '../components/common/DatePicker';

const emptyForm = {
  name: '',
  target_amount: '',
  target_date: '',
  description: '',
  status: 'active' as GoalStatus,
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
  useEffect(() => {
    if (showCreateModal || showEditModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showCreateModal, showEditModal]);

  // AI Recommendations State
  const [smartRecommendations, setSmartRecommendations] = useState<any | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

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
      <div className="flex flex-col items-center justify-center h-[60vh] text-white">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Sincronizando metas financieras...</p>
      </div>
    );
  }

  return (
    <div className="w-full relative min-h-screen pb-20">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] bg-emerald-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold tracking-[0.2em] uppercase mb-1">
              <div className="w-8 h-[1px] bg-emerald-500/50"></div>
              <span>Hitos de Capital</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
              Tus <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400">Objetivos</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium mt-2 max-w-md">
              Visualiza tu crecimiento y acelera el camino hacia tus metas con asistencia de IA.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-wrap gap-3"
          >
            <button
              onClick={handleFetchRecommendations}
              disabled={loadingRecommendations}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all group disabled:opacity-50"
            >
              {loadingRecommendations ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-emerald-400 group-hover:scale-125 transition-transform" />
              )}
              <span className="text-xs font-black uppercase tracking-widest">Consejero IA</span>
            </button>
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 text-white hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all transform hover:-translate-y-1"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Nueva Meta</span>
            </button>
          </motion.div>
        </div>

        {/* Global Progress Summary */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12"
        >
          <div className="md:col-span-2 bg-slate-800/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 flex flex-col justify-center">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Ahorro Total Acumulado</p>
                <p className="text-3xl font-black text-white tracking-tight">${formatMoney(totalSaved)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Progreso Global</p>
                <p className="text-lg font-black text-emerald-400">{globalProgress.toFixed(1)}%</p>
              </div>
            </div>
            <div className="w-full bg-black/40 rounded-full h-3 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(globalProgress, 100)}%` }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              />
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/5 flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
              <Target className="w-7 h-7" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Metas Activas</p>
              <p className="text-2xl font-black text-white">{activeGoalsCount}</p>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-2xl p-6 rounded-[2.5rem] border border-white/5 flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
              <Zap className="w-7 h-7" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Objetivo Final</p>
              <p className="text-2xl font-black text-white">${formatMoney(totalTarget)}</p>
            </div>
          </div>
        </motion.div>

        {/* AI Recommendations Panel */}
        <AnimatePresence>
          {smartRecommendations && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 48 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="bg-gradient-to-br from-emerald-900/40 to-blue-900/40 border border-emerald-500/30 rounded-[2.5rem] p-8 backdrop-blur-xl relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-6">
                <button onClick={() => setSmartRecommendations(null)} className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-emerald-400 hover:text-white transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <Sparkles className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-emerald-300 tracking-tight">Análisis del Consejero IA</h2>
                  <p className="text-xs text-emerald-500 font-bold uppercase tracking-widest">Recomendaciones Estratégicas</p>
                </div>
              </div>

              <div className="bg-black/20 rounded-3xl p-6 border border-white/5 mb-8">
                <p className="text-slate-200 leading-relaxed font-medium italic">"{smartRecommendations.summary_message}"</p>
              </div>
              
              {smartRecommendations.recommendations.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {smartRecommendations.recommendations.map((rec: any, idx: number) => (
                    <motion.div 
                      key={idx} 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-slate-900/60 border border-emerald-500/10 rounded-[2rem] p-6 hover:border-emerald-500/30 transition-all"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-sm font-black text-white uppercase tracking-tight">{rec.goal_name}</span>
                        <div className="px-3 py-1 bg-emerald-500/20 rounded-lg text-emerald-400 text-xs font-black">
                          +${formatMoney(rec.suggested_transfer_cents)}
                        </div>
                      </div>
                      <div className="flex gap-3 items-start">
                        <div className="mt-1 p-1 rounded bg-emerald-500/20 text-emerald-400">
                          <ArrowRight className="w-3 h-3" />
                        </div>
                        <p className="text-xs text-slate-400 font-medium leading-relaxed">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {goals.length === 0 ? (
              <motion.div 
                className="col-span-full py-32 flex flex-col items-center text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mb-8">
                  <Target className="w-12 h-12 text-slate-600" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Tu futuro financiero empieza aquí</h3>
                <p className="text-slate-500 max-w-sm leading-relaxed font-medium">
                  Establece tu primera meta de ahorro y deja que el sistema te ayude a materializarla.
                </p>
              </motion.div>
            ) : (
              goals.map((goal, index) => {
                const percentage = (goal.current_amount / goal.target_amount) * 100;
                const remaining = goal.target_amount - goal.current_amount;
                const isCompleted = goal.status === 'completed';
                
                return (
                  <motion.div
                    key={goal.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className="group bg-slate-800/30 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 hover:border-white/10 transition-all p-8 relative overflow-hidden"
                  >
                    {/* Progress Background Decor */}
                    <motion.div 
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: Math.min(percentage, 100) / 100 }}
                      style={{ originX: 0 }}
                      className={`absolute bottom-0 left-0 right-0 h-1 transition-all duration-1000 ${
                        isCompleted ? 'bg-emerald-500' : 'bg-blue-500'
                      }`}
                    />

                    <div className="flex items-start justify-between mb-8 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${
                          isCompleted 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : 'bg-white/5 border-white/10 text-slate-400 group-hover:text-blue-400'
                        }`}>
                          {isCompleted ? <CheckCircle2 className="w-8 h-8" /> : <Target className="w-8 h-8" />}
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-white tracking-tight leading-tight">{goal.name}</h3>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                              goal.status === 'completed' 
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                : goal.status === 'cancelled'
                                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                            }`}>
                              {goal.status === 'completed' ? 'Completada' : goal.status === 'cancelled' ? 'Cancelada' : 'En Progreso'}
                            </span>
                            {goal.target_date && (
                              <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
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
                          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 text-slate-500 hover:text-white transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(goal.id)} 
                          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                      <div>
                        <div className="flex justify-between items-end mb-4">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Ahorro Actual</span>
                            <span className="text-2xl font-black text-white tracking-tight">${formatMoney(goal.current_amount)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Meta Final</span>
                            <span className="text-sm font-black text-slate-400">${formatMoney(goal.target_amount)}</span>
                          </div>
                        </div>

                        {/* Progress Meter */}
                        <div className="relative h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 p-0.5">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(percentage, 100)}%` }}
                            className={`h-full rounded-full transition-all duration-1000 ${
                              isCompleted 
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]' 
                                : 'bg-gradient-to-r from-blue-600 to-indigo-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${percentage > 90 ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`}></div>
                          <span className="text-xs font-black text-white tracking-tight">{percentage.toFixed(0)}% Alcanzado</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Faltante</p>
                          <p className="text-sm font-black text-emerald-400 tracking-tight">${formatMoney(Math.max(0, remaining))}</p>
                        </div>
                      </div>

                      {goal.description && (
                        <div className="pt-4 border-t border-white/5">
                          <div className="flex gap-2 items-start opacity-60">
                            <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <p className="text-[11px] font-medium text-slate-400 leading-relaxed italic line-clamp-2">
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

      {/* Modals with custom glass styling */}
      <AnimatePresence>
        {(showCreateModal || showEditModal) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowCreateModal(false);
                setShowEditModal(false);
              }}
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
                      {showCreateModal ? 'Nuevo Objetivo' : 'Ajustar Meta'}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Parámetros de Crecimiento</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                  }} 
                  className="w-10 h-10 md:w-12 md:h-12 rounded-2xl hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all"
                >
                  <X className="w-6 h-6 md:w-8 md:h-8" />
                </button>
              </div>

              <form 
                onSubmit={showCreateModal ? handleCreateSubmit : handleEditSubmit} 
                className="p-6 md:p-10 space-y-6 md:space-y-8 overflow-y-auto custom-scrollbar overscroll-contain"
              >
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Nombre de la Meta</label>
                    <input
                      type="text"
                      required
                      value={showCreateModal ? form.name : editForm.name}
                      onChange={e => showCreateModal ? setForm({...form, name: e.target.value}) : setEditForm({...editForm, name: e.target.value})}
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
                        value={showCreateModal ? form.target_amount : editForm.target_amount}
                        onChange={e => showCreateModal ? setForm({...form, target_amount: e.target.value}) : setEditForm({...editForm, target_amount: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-black focus:outline-none focus:border-emerald-500/50 transition-all text-2xl"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Fecha Límite</label>
                      <DatePicker
                        value={showCreateModal ? form.target_date : editForm.target_date}
                        onChange={(value) => showCreateModal ? setForm({...form, target_date: value}) : setEditForm({...editForm, target_date: value})}
                        placeholder="Elegir fecha"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Estado de la Misión</label>
                    <Select
                      value={showCreateModal ? form.status : editForm.status}
                      onChange={(value) => showCreateModal ? setForm({...form, status: value as GoalStatus}) : setEditForm({...editForm, status: value as GoalStatus})}
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
                      value={showCreateModal ? form.description : editForm.description}
                      onChange={e => showCreateModal ? setForm({...form, description: e.target.value}) : setEditForm({...editForm, description: e.target.value})}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-medium focus:outline-none focus:border-emerald-500/50 transition-all text-sm"
                      rows={3}
                      placeholder="Describe por qué es importante esta meta..."
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setShowEditModal(false);
                    }}
                    className="flex-1 px-8 py-5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] px-8 py-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-xl hover:shadow-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    {saving ? 'Procesando...' : showCreateModal ? 'Establecer Objetivo' : 'Actualizar Misión'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

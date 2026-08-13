import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { remindersAPI } from '../services/api';
import type { Reminder, ReminderFrequency, ReminderStatus } from '../types';
import type { AxiosError } from 'axios';

type ValidationErrorResponse = AxiosError<{ detail?: string | Array<{ msg: string }> }>;
import { formatMoney, toCents } from '../utils/money';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Bell, 
  CheckCircle2, 
  Calendar, 
  X, 
  AlertCircle,
  RefreshCw,
  CalendarDays,
  Zap,
  Check
} from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Select from '../components/common/Select';
import DatePicker from '../components/common/DatePicker';

const emptyForm = {
  name: '',
  amount: '',
  due_date: new Date().toISOString().split('T')[0],
  frequency: 'once' as ReminderFrequency,
  description: '',
  status: 'pending' as ReminderStatus,
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

  useEffect(() => {
    fetchReminders();
  }, []);

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    try {
      await remindersAPI.delete(deleteConfirm.id);
      setToast({ message: 'Alerta eliminada del sistema', type: 'success' });
      fetchReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
      const detail = (error as ValidationErrorResponse).response?.data?.detail;
      const errorMessage = Array.isArray(detail)
        ? detail[0]?.msg || 'Error al eliminar recordatorio'
        : detail || 'Error al eliminar recordatorio';
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setEditForm({
      name: reminder.name,
      amount: reminder.amount ? (reminder.amount / 100).toString() : '',
      due_date: reminder.due_date.substring(0, 10),
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
        amount: form.amount ? toCents(form.amount) : null,
        due_date: form.due_date + 'T00:00:00',
        frequency: form.frequency,
        description: form.description || '',
        status: form.status,
        is_active: form.is_active,
      });
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Nueva alerta programada', type: 'success' });
      fetchReminders();
    } catch (error) {
      console.error('Error creating reminder:', error);
      const detail = (error as ValidationErrorResponse).response?.data?.detail;
      const errorMessage = Array.isArray(detail)
        ? detail[0]?.msg || 'Error al crear recordatorio'
        : detail || 'Error al crear recordatorio';
      setToast({ message: errorMessage, type: 'error' });
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
        amount: editForm.amount ? toCents(editForm.amount) : null,
        due_date: editForm.due_date + 'T00:00:00',
        frequency: editForm.frequency,
        description: editForm.description || '',
        status: editForm.status,
        is_active: editForm.is_active,
      });
      setShowEditModal(false);
      setEditingReminder(null);
      setEditForm(emptyForm);
      setToast({ message: 'Configuración de alerta actualizada', type: 'success' });
      fetchReminders();
    } catch (error) {
      console.error('Error updating reminder:', error);
      const detail = (error as ValidationErrorResponse).response?.data?.detail;
      const errorMessage = Array.isArray(detail)
        ? detail[0]?.msg || 'Error al actualizar recordatorio'
        : detail || 'Error al actualizar recordatorio';
      setToast({ message: errorMessage, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkComplete = async (id: string) => {
    try {
      await remindersAPI.update(id, { status: 'completed' });
      setToast({ message: 'Misión cumplida', type: 'success' });
      fetchReminders();
    } catch (error) {
      console.error('Error marking reminder as complete:', error);
      const detail = (error as ValidationErrorResponse).response?.data?.detail;
      const errorMessage = Array.isArray(detail)
        ? detail[0]?.msg || 'Error al actualizar recordatorio'
        : detail || 'Error al actualizar recordatorio';
      setToast({ message: errorMessage, type: 'error' });
    }
  };

  const getUrgencyLevel = (dueDate: string, status: string) => {
    if (status === 'completed') return 'low';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    
    if (due < today) return 'critical';
    if (due.getTime() === today.getTime() || (due.getTime() - today.getTime()) <= 86400000 * 2) return 'high';
    return 'normal';
  };

  const getStatusConfig = (urgency: string, status: string) => {
    if (status === 'completed') {
      return { 
        color: 'text-emerald-400', 
        bg: 'bg-emerald-500/10', 
        border: 'border-emerald-500/20',
        label: 'Completado',
        glow: 'shadow-[0_0_15px_rgba(16,185,129,0.1)]'
      };
    }
    
    switch (urgency) {
      case 'critical':
        return { 
          color: 'text-rose-400', 
          bg: 'bg-rose-500/10', 
          border: 'border-rose-500/20',
          label: 'Vencido',
          glow: 'shadow-[0_0_20px_rgba(244,63,94,0.3)]'
        };
      case 'high':
        return { 
          color: 'text-amber-400', 
          bg: 'bg-amber-500/10', 
          border: 'border-amber-500/20',
          label: 'Próximo',
          glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]'
        };
      default:
        return { 
          color: 'text-blue-400', 
          bg: 'bg-blue-500/10', 
          border: 'border-blue-500/20',
          label: 'Pendiente',
          glow: ''
        };
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'daily': return 'Diario';
      case 'weekly': return 'Semanal';
      case 'monthly': return 'Mensual';
      case 'yearly': return 'Anual';
      default: return 'Una vez';
    }
  };

  // Stats for summary
  const pendingCount = reminders.filter(r => r.status === 'pending' && r.is_active).length;
  const criticalCount = reminders.filter(r => getUrgencyLevel(r.due_date, r.status) === 'critical' && r.status !== 'completed').length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-white">
        <RefreshCw className="w-10 h-10 animate-spin text-orange-500 mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Sincronizando calendario de alertas...</p>
      </div>
    );
  }

  return (
    <div className="w-full relative min-h-screen pb-20">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[15%] -left-[10%] w-[50%] h-[50%] bg-orange-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[25%] -right-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="flex items-center gap-2 text-orange-400 text-xs font-bold tracking-[0.2em] uppercase mb-1">
              <div className="w-8 h-[1px] bg-orange-500/50"></div>
              <span>Timeline de Alertas</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
              Tus <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-400">Recordatorios</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium mt-2 max-w-md">
              Mantente al tanto de tus compromisos y evita recargos innecesarios.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-orange-600 to-rose-600 text-white hover:shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all transform hover:-translate-y-1"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Nueva Alerta</span>
            </button>
          </motion.div>
        </div>

        {/* Quick Stats Summary */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-4 mb-12"
        >
          <div className="bg-slate-800/40 backdrop-blur-2xl px-6 py-4 rounded-2xl border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 text-orange-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Pendientes</p>
              <p className="text-lg font-black text-white">{pendingCount}</p>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-2xl px-6 py-4 rounded-2xl border border-white/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20 text-rose-400">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Críticos</p>
              <p className="text-lg font-black text-white">{criticalCount}</p>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-2xl px-6 py-4 rounded-2xl border border-white/5 flex items-center gap-4 ml-auto">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
              <CalendarDays className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-300">
              Hoy: <span className="text-white ml-1">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </p>
          </div>
        </motion.div>

        {/* Reminders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {reminders.length === 0 ? (
              <motion.div 
                className="col-span-full py-32 flex flex-col items-center text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mb-8">
                  <Bell className="w-12 h-12 text-slate-600" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">No tienes alertas pendientes</h3>
                <p className="text-slate-500 max-w-sm leading-relaxed font-medium">
                  Configura recordatorios para que nunca se te pase un pago o una fecha importante.
                </p>
              </motion.div>
            ) : (
              reminders
                .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                .map((reminder, index) => {
                  const urgency = getUrgencyLevel(reminder.due_date, reminder.status);
                  const config = getStatusConfig(urgency, reminder.status);
                  const isCompleted = reminder.status === 'completed';
                  
                  return (
                    <motion.div
                      key={reminder.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05 }}
                      className={`group bg-slate-800/30 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 hover:border-white/10 transition-all p-8 relative overflow-hidden ${
                        !reminder.is_active ? 'opacity-50 grayscale' : ''
                      } ${config.glow}`}
                    >
                      {/* Background Status Indicator */}
                      <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-10 transition-all group-hover:opacity-20 ${
                        isCompleted ? 'bg-emerald-600' : urgency === 'critical' ? 'bg-rose-600' : urgency === 'high' ? 'bg-amber-600' : 'bg-blue-600'
                      }`}></div>

                      <div className="flex items-start justify-between mb-8 relative z-10">
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${config.bg} ${config.border} ${config.color}`}>
                            {isCompleted ? <CheckCircle2 className="w-8 h-8" /> : <Bell className="w-8 h-8" />}
                          </div>
                          <div>
                            <h3 className="text-xl font-black text-white tracking-tight leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all">
                              {reminder.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${config.bg} ${config.border} ${config.color}`}>
                                {config.label}
                              </span>
                              {!reminder.is_active && (
                                <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-white/5 text-slate-500 text-[9px] font-black uppercase tracking-widest">
                                  Inactivo
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-1">
                          {reminder.status === 'pending' && reminder.is_active && (
                            <button 
                              onClick={() => handleMarkComplete(reminder.id)} 
                              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-all"
                              title="Completar"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                          )}
                          <button 
                            onClick={() => handleEdit(reminder)} 
                            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 text-slate-500 hover:text-white transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(reminder.id)} 
                            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-6 relative z-10">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Vencimiento
                            </p>
                            <p className="text-sm font-black text-white">
                              {new Date(reminder.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                          <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                              <Zap className="w-3 h-3" /> Frecuencia
                            </p>
                            <p className="text-sm font-black text-white">
                              {getFrequencyLabel(reminder.frequency)}
                            </p>
                          </div>
                        </div>

                        {reminder.amount && (
                          <div className="flex justify-between items-center px-4 py-3 bg-white/5 rounded-2xl border border-white/5">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Monto Estimado</span>
                            <span className="text-lg font-black text-white tracking-tight">${formatMoney(reminder.amount)}</span>
                          </div>
                        )}

                        {reminder.description && (
                          <div className="pt-4 border-t border-white/5">
                            <p className="text-xs font-medium text-slate-400 leading-relaxed italic line-clamp-2">
                              "{reminder.description}"
                            </p>
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
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20 text-orange-400">
                    <Bell className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                      {showCreateModal ? 'Nueva Alerta' : 'Editar Recordatorio'}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Planificación de Tareas</p>
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
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Título del Recordatorio</label>
                    <input
                      type="text"
                      required
                      value={showCreateModal ? form.name : editForm.name}
                      onChange={e => showCreateModal ? setForm({...form, name: e.target.value}) : setEditForm({...editForm, name: e.target.value})}
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
                        value={showCreateModal ? form.amount : editForm.amount}
                        onChange={e => showCreateModal ? setForm({...form, amount: e.target.value}) : setEditForm({...editForm, amount: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-black focus:outline-none focus:border-orange-500/50 transition-all text-2xl"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Fecha Límite</label>
                      <DatePicker
                        value={showCreateModal ? form.due_date : editForm.due_date}
                        onChange={(value) => showCreateModal ? setForm({...form, due_date: value}) : setEditForm({...editForm, due_date: value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Ciclo de Repetición</label>
                      <Select
                        value={showCreateModal ? form.frequency : editForm.frequency}
                        onChange={(value) => showCreateModal ? setForm({...form, frequency: value as ReminderFrequency}) : setEditForm({...editForm, frequency: value as ReminderFrequency})}
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
                        value={showCreateModal ? form.status : editForm.status}
                        onChange={(value) => showCreateModal ? setForm({...form, status: value as ReminderStatus}) : setEditForm({...editForm, status: value as ReminderStatus})}
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
                      value={showCreateModal ? form.description : editForm.description}
                      onChange={e => showCreateModal ? setForm({...form, description: e.target.value}) : setEditForm({...editForm, description: e.target.value})}
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
                        checked={showCreateModal ? form.is_active : editForm.is_active}
                        onChange={e => showCreateModal ? setForm({...form, is_active: e.target.checked}) : setEditForm({...editForm, is_active: e.target.checked})}
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
                    className="flex-[2] px-8 py-5 rounded-2xl bg-gradient-to-r from-orange-600 to-rose-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-xl hover:shadow-orange-500/20 transition-all disabled:opacity-50"
                  >
                    {saving ? 'Procesando...' : showCreateModal ? 'Crear Alerta' : 'Actualizar Alerta'}
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
        title="Eliminar Alerta"
        message="¿Estás seguro de que quieres eliminar este recordatorio? Esta acción es irreversible y podrías olvidar el compromiso."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Reminders;

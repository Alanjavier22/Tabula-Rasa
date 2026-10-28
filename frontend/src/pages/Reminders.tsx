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
  AlertCircle,
  RefreshCw,
  CalendarDays,
  Zap,
  Check
} from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import ReminderFormModal, { type ReminderFormData } from '../components/reminders/ReminderFormModal';

const emptyForm: ReminderFormData = {
  name: '',
  amount: '',
  due_date: new Date().toISOString().split('T')[0],
  frequency: 'once' as ReminderFrequency,
  description: '',
  status: 'pending' as ReminderStatus,
  is_active: true,
};

const getReminderGlowClass = (isCompleted: boolean, urgency: string) => {
  if (isCompleted) return 'bg-success';
  if (urgency === 'critical') return 'bg-danger';
  if (urgency === 'high') return 'bg-warning';
  return 'bg-info';
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
    void Promise.resolve().then(fetchReminders);
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
        color: 'text-success',
        bg: 'bg-success-soft',
        border: 'border-line',
        label: 'Completado',
        glow: ''
      };
    }

    switch (urgency) {
      case 'critical':
        return {
          color: 'text-danger',
          bg: 'bg-danger-soft',
          border: 'border-line',
          label: 'Vencido',
          glow: ''
        };
      case 'high':
        return {
          color: 'text-warning',
          bg: 'bg-warning-soft',
          border: 'border-line',
          label: 'Próximo',
          glow: ''
        };
      default:
        return {
          color: 'text-info',
          bg: 'bg-info-soft',
          border: 'border-line',
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
      <div className="flex flex-col items-center justify-center h-[60vh] text-primary">
        <RefreshCw className="w-10 h-10 animate-spin text-warning mb-4" />
        <p className="text-muted font-medium animate-pulse">Sincronizando calendario de alertas...</p>
      </div>
    );
  }

  return (
    <div className="reminders-page compact-page w-full relative min-h-screen pb-20">
      {/* Background Decor */}


      <div className="compact-page-content relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="compact-page-header flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>

            <h1 className="text-4xl lg:text-5xl font-black text-primary tracking-tight">Recordatorios</h1>
            <p className="text-muted text-sm lg:text-base font-medium mt-2 max-w-md">
              Mantente al tanto de tus compromisos y evita recargos innecesarios.
            </p>
          </motion.div>

          <motion.div
            className="compact-page-actions"
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
          >
            <button
              onClick={() => setShowCreateModal(true)}
              className="app-btn app-btn-primary"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Nuevo recordatorio</span>
            </button>
          </motion.div>
        </div>

        {/* Quick Stats Summary */}
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="compact-summary flex flex-wrap gap-4 mb-12"
        >
          <div className="compact-summary-card bg-surface  px-6 py-4 rounded-2xl border border-line flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center border border-line text-warning">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest">Pendientes</p>
              <p className="text-lg font-black text-primary">{pendingCount}</p>
            </div>
          </div>

          <div className="compact-summary-card bg-surface  px-6 py-4 rounded-2xl border border-line flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-danger-soft flex items-center justify-center border border-line text-danger">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest">Críticos</p>
              <p className="text-lg font-black text-primary">{criticalCount}</p>
            </div>
          </div>

          <div className="compact-summary-card bg-surface  px-6 py-4 rounded-2xl border border-line flex items-center gap-4 ml-auto">
            <div className="w-10 h-10 rounded-xl bg-info-soft flex items-center justify-center border border-line text-info">
              <CalendarDays className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-muted">
              Hoy: <span className="text-primary ml-1">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </p>
          </div>
        </motion.div>

        {/* Reminders Grid */}
        <div className="compact-page-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {reminders.length === 0 ? (
              <motion.div
                className="compact-empty col-span-full py-32 flex flex-col items-center text-center bg-surface-soft rounded-2xl border border-dashed border-line"
                initial={false}
                animate={{ opacity: 1 }}
              >
                <div className="w-24 h-24 rounded-full bg-surface flex items-center justify-center mb-8">
                  <Bell className="w-12 h-12 text-muted" />
                </div>
                <h3 className="text-2xl font-bold text-primary mb-3">No tienes alertas pendientes</h3>
                <p className="text-muted max-w-sm leading-relaxed font-medium">
                  Configura recordatorios para que nunca se te pase un pago o una fecha importante.
                </p>
                <button type="button" className="app-btn app-btn-primary mt-5" onClick={() => setShowCreateModal(true)}>Crear recordatorio</button>
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
                      initial={false}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05 }}
                      className={`compact-card group bg-surface  rounded-2xl border border-line hover:border-line transition-all p-8 relative overflow-hidden ${
                        !reminder.is_active ? 'opacity-50 grayscale' : ''
                      } ${config.glow}`}
                    >
                      {/* Background Status Indicator */}
                      <div className={`absolute top-0 right-0 w-32 h-32  opacity-10 transition-all group-hover:opacity-20 ${getReminderGlowClass(isCompleted, urgency)}`}></div>

                      <div className="flex items-start justify-between mb-8 relative z-10">
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${config.bg} ${config.border} ${config.color}`}>
                            {isCompleted ? <CheckCircle2 className="w-8 h-8" /> : <Bell className="w-8 h-8" />}
                          </div>
                          <div>
                            <h3 className="text-xl font-black text-primary tracking-tight leading-tight group-hover:text-primary     transition-all">
                              {reminder.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={`px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-widest border ${config.bg} ${config.border} ${config.color}`}>
                                {config.label}
                              </span>
                              {!reminder.is_active && (
                                <span className="px-2 py-0.5 rounded-lg bg-canvas border border-line text-muted text-xs font-black uppercase tracking-widest">
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
                              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-success-soft text-muted hover:text-success transition-all"
                              title="Completar"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(reminder)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface-soft text-muted hover:text-primary transition-all"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(reminder.id)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-danger-soft text-muted hover:text-danger transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-6 relative z-10">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-surface-soft rounded-2xl p-4 border border-line">
                            <p className="text-xs font-black text-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Vencimiento
                            </p>
                            <p className="text-sm font-black text-primary">
                              {new Date(reminder.due_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                          <div className="bg-surface-soft rounded-2xl p-4 border border-line">
                            <p className="text-xs font-black text-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
                              <Zap className="w-3 h-3" /> Frecuencia
                            </p>
                            <p className="text-sm font-black text-primary">
                              {getFrequencyLabel(reminder.frequency)}
                            </p>
                          </div>
                        </div>

                        {reminder.amount && (
                          <div className="flex justify-between items-center px-4 py-3 bg-surface-soft rounded-2xl border border-line">
                            <span className="text-xs font-black text-muted uppercase tracking-widest">Monto Estimado</span>
                            <span className="text-lg font-black text-primary tracking-tight">${formatMoney(reminder.amount)}</span>
                          </div>
                        )}

                        {reminder.description && (
                          <div className="pt-4 border-t border-line">
                            <p className="text-xs font-medium text-muted leading-relaxed italic line-clamp-2">
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

      <ReminderFormModal
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
        title="Eliminar Alerta"
        message="¿Estás seguro de que quieres eliminar este recordatorio? Esta acción es irreversible y podrías olvidar el compromiso."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Reminders;

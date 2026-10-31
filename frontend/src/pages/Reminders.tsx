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

const getLocalTodayIso = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (raw: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const fallback = new Date(raw);
  fallback.setHours(0, 0, 0, 0);
  return fallback;
};

const emptyForm: ReminderFormData = {
  name: '',
  amount: '',
  due_date: getLocalTodayIso(),
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
      void fetchReminders();
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
      setForm({ ...emptyForm, due_date: getLocalTodayIso() });
      setToast({ message: 'Nueva alerta programada', type: 'success' });
      void fetchReminders();
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
      setEditForm({ ...emptyForm, due_date: getLocalTodayIso() });
      setToast({ message: 'Configuración de alerta actualizada', type: 'success' });
      void fetchReminders();
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
      setToast({ message: 'Recordatorio marcado como completado', type: 'success' });
      void fetchReminders();
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
    const due = parseLocalDate(dueDate);

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
      };
    }

    switch (urgency) {
      case 'critical':
        return {
          color: 'text-danger',
          bg: 'bg-danger-soft',
          border: 'border-line',
          label: 'Vencido',
        };
      case 'high':
        return {
          color: 'text-warning',
          bg: 'bg-warning-soft',
          border: 'border-line',
          label: 'Próximo',
        };
      default:
        return {
          color: 'text-info',
          bg: 'bg-info-soft',
          border: 'border-line',
          label: 'Pendiente',
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

  const pendingCount = reminders.filter(r => r.status === 'pending' && r.is_active).length;
  const criticalCount = reminders.filter(r => getUrgencyLevel(r.due_date, r.status) === 'critical' && r.status !== 'completed').length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-primary">
        <RefreshCw className="w-8 h-8 animate-spin text-warning mb-3" />
        <p className="text-muted text-sm font-medium">Sincronizando calendario de alertas...</p>
      </div>
    );
  }

  return (
    <div className="reminders-page compact-page w-full relative min-h-screen pb-20">
      <div className="compact-page-content relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="compact-page-header flex flex-col lg:flex-row lg:items-end justify-between mb-8 gap-6">
          <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>
            <h1 className="app-page-title text-3xl lg:text-4xl font-black text-primary tracking-tight">Recordatorios</h1>
            <p className="text-muted text-sm font-medium mt-1.5 max-w-md">
              Mantente al tanto de tus compromisos financieros y evita recargos por mora.
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
              <Plus className="w-4 h-4" />
              <span className="text-sm font-semibold">Nuevo recordatorio</span>
            </button>
          </motion.div>
        </div>

        {/* Quick Stats Summary */}
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="compact-summary grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
        >
          <div className="compact-summary-card bg-surface px-5 py-4 rounded-xl border border-line flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-warning-soft flex items-center justify-center border border-line text-warning shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Pendientes activos</p>
              <p className="text-xl font-bold text-primary tabular-nums">{pendingCount}</p>
            </div>
          </div>

          <div className="compact-summary-card bg-surface px-5 py-4 rounded-xl border border-line flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-danger-soft flex items-center justify-center border border-line text-danger shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Vencidos / críticos</p>
              <p className="text-xl font-bold text-primary tabular-nums">{criticalCount}</p>
            </div>
          </div>

          <div className="compact-summary-card bg-surface px-5 py-4 rounded-xl border border-line flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-info-soft flex items-center justify-center border border-line text-info shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-muted uppercase tracking-wider">Fecha actual</p>
              <p className="text-sm font-semibold text-primary capitalize">
                {new Date().toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Reminders Grid */}
        <div className="compact-page-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {reminders.length === 0 ? (
              <motion.div
                className="compact-empty col-span-full py-20 flex flex-col items-center text-center bg-surface-soft rounded-xl border border-dashed border-line"
                initial={false}
                animate={{ opacity: 1 }}
              >
                <div className="w-14 h-14 rounded-full bg-surface border border-line flex items-center justify-center mb-4">
                  <Bell className="w-6 h-6 text-muted" />
                </div>
                <h3 className="text-lg font-bold text-primary mb-1.5">No tienes alertas pendientes</h3>
                <p className="text-muted text-sm max-w-sm leading-relaxed">
                  Configura recordatorios para que nunca se te pase un pago o una fecha importante.
                </p>
                <button type="button" className="app-btn app-btn-primary mt-5" onClick={() => setShowCreateModal(true)}>
                  Crear recordatorio
                </button>
              </motion.div>
            ) : (
              [...reminders]
                .sort((a, b) => parseLocalDate(a.due_date).getTime() - parseLocalDate(b.due_date).getTime())
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
                      transition={{ delay: index * 0.03 }}
                      className={`compact-card group bg-surface rounded-xl border border-line p-5 relative flex flex-col justify-between transition-all ${
                        !reminder.is_active ? 'opacity-55 grayscale' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${config.bg} ${config.border} ${config.color}`}>
                              {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-base font-bold text-primary leading-snug truncate" title={reminder.name}>
                                {reminder.name}
                              </h3>
                              <div className="flex items-center flex-wrap gap-1.5 mt-1">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${config.bg} ${config.border} ${config.color}`}>
                                  {config.label}
                                </span>
                                {!reminder.is_active && (
                                  <span className="px-2 py-0.5 rounded-md bg-canvas border border-line text-muted text-[10px] font-bold uppercase tracking-wider">
                                    Inactivo
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="subscription-card-actions shrink-0">
                            {reminder.status === 'pending' && reminder.is_active && (
                              <button
                                type="button"
                                onClick={() => handleMarkComplete(reminder.id)}
                                className="subscription-card-action text-success hover:bg-success-soft"
                                title="Marcar como completado"
                                aria-label={`Completar recordatorio ${reminder.name}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEdit(reminder)}
                              className="subscription-card-action"
                              title="Editar recordatorio"
                              aria-label={`Editar recordatorio ${reminder.name}`}
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(reminder.id)}
                              className="subscription-card-action subscription-card-action-delete"
                              title="Eliminar recordatorio"
                              aria-label={`Eliminar recordatorio ${reminder.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 mb-3">
                          <div className="bg-surface-soft rounded-lg px-3 py-2 border border-line">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Vencimiento
                            </p>
                            <p className="text-xs font-semibold text-primary">
                              {parseLocalDate(reminder.due_date).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                          <div className="bg-surface-soft rounded-lg px-3 py-2 border border-line">
                            <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-0.5 flex items-center gap-1">
                              <Zap className="w-3 h-3" /> Frecuencia
                            </p>
                            <p className="text-xs font-semibold text-primary">
                              {getFrequencyLabel(reminder.frequency)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        {reminder.amount ? (
                          <div className="flex justify-between items-center px-3 py-2 bg-surface-soft rounded-lg border border-line">
                            <span className="text-[11px] font-bold text-muted uppercase tracking-wider">Monto estimado</span>
                            <span className="text-sm font-bold text-primary tabular-nums">${formatMoney(reminder.amount)}</span>
                          </div>
                        ) : null}

                        {reminder.description && (
                          <p className="text-xs text-muted leading-relaxed line-clamp-2 pt-2 border-t border-line">
                            {reminder.description}
                          </p>
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

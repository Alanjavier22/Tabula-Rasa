import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { subscriptionsAPI, categoriesAPI, accountsAPI } from '../services/api';
import type { Subscription, Category, Account, SubscriptionFrequency } from '../types';
import type { AxiosError } from 'axios';
import { formatMoney, toCents } from '../utils/money';
import {
  Plus,
  Trash2,
  Edit,
  Calendar,
  CreditCard,
  CheckCircle,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Smartphone,
  Loader2,
  Zap
} from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import SubscriptionFormModal, { type SubscriptionFormData } from '../components/subscriptions/SubscriptionFormModal';

const emptyForm: SubscriptionFormData = {
  name: '',
  amount: '',
  frequency: 'monthly' as SubscriptionFrequency,
  next_billing_date: '',
  account_id: '',
  category_id: '',
  is_active: true,
};

const Subscriptions = () => {
  const queryClient = useQueryClient();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });
  const [payingId, setPayingId] = useState<string | null>(null);

  // Bloquear scroll del body cuando el modal está abierto


  const fetchAll = async () => {
    try {
      const [subRes, catRes, accRes] = await Promise.all([
        subscriptionsAPI.getAll(),
        categoriesAPI.getAll(),
        accountsAPI.getAll(),
      ]);
      setSubscriptions(subRes.data);
      setCategories(catRes.data);
      setAccounts(accRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      setToast({ message: 'No se pudieron cargar las suscripciones', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchAll);
  }, []);

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    try {
      await subscriptionsAPI.delete(deleteConfirm.id);
      setToast({ message: 'Suscripción removida del ecosistema', type: 'success' });
      void fetchAll();
    } catch (error) {
      console.error('Error deleting subscription:', error);
      setToast({ message: (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al eliminar suscripción', type: 'error' });
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    setForm({
      name: subscription.name,
      amount: (subscription.amount / 100).toString(),
      frequency: subscription.frequency,
      next_billing_date: subscription.next_billing_date ? subscription.next_billing_date.substring(0, 10) : '',
      account_id: subscription.account_id?.toString() || '',
      category_id: subscription.category_id?.toString() || '',
      is_active: subscription.is_active,
    });
    setShowModal(true);
  };

  const handlePay = async (subscription: Subscription) => {
    setPayingId(subscription.id);
    try {
      const res = await subscriptionsAPI.pay(subscription.id);
      setToast({
        message: `✅ Pago registrado. Próximo ciclo: ${res.data.next_billing_date ? new Date(res.data.next_billing_date).toLocaleDateString('es-ES') : 'N/A'}`,
        type: 'success'
      });
      void fetchAll();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    } catch (error) {
      console.error('Error paying subscription:', error);
      setToast({ message: (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al registrar pago', type: 'error' });
    } finally {
      setPayingId(null);
    }
  };

  const getUrgencyConfig = (nextDate?: string | null) => {
    if (!nextDate) return { label: null, color: 'text-muted', glow: '' };
    const billing = new Date(nextDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    billing.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((billing.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: 'VENCIDA', color: 'text-danger', glow: ' border-line' };
    if (diffDays === 0) return { label: 'HOY', color: 'text-warning', glow: ' border-line' };
    if (diffDays <= 3) return { label: 'PRONTO', color: 'text-info', glow: ' border-line' };
    return { label: null, color: 'text-muted', glow: 'border-line' };
  };

  const handleSubmit = async (data: SubscriptionFormData) => {
    setSaving(true);
    try {
      if (editingSubscription) {
        await subscriptionsAPI.update(editingSubscription.id, {
          name: data.name,
          amount: toCents(data.amount),
          frequency: data.frequency,
          next_billing_date: data.next_billing_date ? data.next_billing_date + 'T00:00:00' : null,
          account_id: data.account_id || null,
          category_id: data.category_id || null,
          is_active: data.is_active,
        });
        setToast({ message: 'Suscripción actualizada', type: 'success' });
      } else {
        await subscriptionsAPI.create({
          name: data.name,
          amount: toCents(data.amount),
          frequency: data.frequency,
          next_billing_date: data.next_billing_date ? data.next_billing_date + 'T00:00:00' : null,
          account_id: data.account_id || null,
          category_id: data.category_id || null,
          is_active: data.is_active,
        });
        setToast({ message: 'Suscripción creada exitosamente', type: 'success' });
      }
      setShowModal(false);
      setEditingSubscription(null);
      setForm(emptyForm);
      void fetchAll();
    } catch (error) {
      console.error('Error saving subscription:', error);
      setToast({ message: (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error en la operación', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const calculateMonthlyCost = () => {
    return subscriptions.reduce((total, sub) => {
      if (!sub.is_active) return total;
      const divisor = {
        weekly: 1/4,
        monthly: 1,
        quarterly: 3,
        yearly: 12,
      }[sub.frequency] || 1;
      return total + (sub.amount / divisor);
    }, 0);
  };

  const getFrequencyLabel = (freq: SubscriptionFrequency) => {
    const labels = {
      weekly: 'Semanal',
      monthly: 'Mensual',
      quarterly: 'Trimestral',
      yearly: 'Anual',
    };
    return labels[freq] || freq;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-primary">
        <Loader2 className="w-10 h-10 animate-spin text-accent-strong mb-4" />
        <p className="text-muted font-medium animate-pulse">Analizando suscripciones recurrentes...</p>
      </div>
    );
  }

  const monthlyCost = calculateMonthlyCost();
  const annualCost = monthlyCost * 12;

  return (
    <div className="subscriptions-page compact-page w-full relative min-h-screen pb-20">
      {/* Background Decor */}


      <div className="compact-page-content relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="compact-page-header flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>

            <h1 className="text-4xl lg:text-5xl font-black text-primary tracking-tight">Suscripciones</h1>
            <p className="text-muted text-sm lg:text-base font-medium mt-2 max-w-md">
              Monitorea tus servicios digitales y optimiza tus gastos automáticos cada mes.
            </p>
          </motion.div>

          <motion.div
            className="compact-page-actions"
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
          >
            <button
              onClick={() => setShowModal(true)}
              className="app-btn app-btn-primary"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Nueva Suscripción</span>
            </button>
          </motion.div>
        </div>

        {/* Financial Impact Dashboard */}
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          className="compact-summary grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="compact-summary-card bg-surface  p-8 rounded-2xl border border-line flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Clock className="w-16 h-16 text-accent-strong" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Impacto Mensual</p>
              <p className="text-3xl font-black text-primary tracking-tight">${formatMoney(monthlyCost)}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-accent-strong text-xs font-bold">
              <TrendingUp className="w-3 h-3" />
              <span>Costo fijo proyectado</span>
            </div>
          </div>

          <div className="compact-summary-card bg-surface  p-8 rounded-2xl border border-line flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <CreditCard className="w-16 h-16 text-accent-strong" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Impacto Anual</p>
              <p className="text-3xl font-black text-primary tracking-tight">${formatMoney(annualCost)}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-accent-strong text-xs font-bold">
              <Zap className="w-3 h-3" />
              <span>Inversión total anual</span>
            </div>
          </div>

          <div className="compact-summary-card bg-surface  p-8 rounded-2xl border border-line flex items-center gap-6">
            <div className="w-16 h-16 rounded-[1.5rem] bg-success-soft flex items-center justify-center border border-line text-success">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Servicios Activos</p>
              <p className="text-3xl font-black text-primary">{subscriptions.filter(s => s.is_active).length}</p>
              <p className="text-xs text-muted mt-1 font-bold">DE UN TOTAL DE {subscriptions.length}</p>
            </div>
          </div>
        </motion.div>

        {/* Subscriptions Grid */}
        <div className="compact-page-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {subscriptions.length === 0 ? (
              <motion.div
                className="compact-empty col-span-full py-32 flex flex-col items-center text-center bg-surface-soft rounded-2xl border border-dashed border-line"
                initial={false}
                animate={{ opacity: 1 }}
              >
                <div className="w-24 h-24 rounded-full bg-surface flex items-center justify-center mb-8">
                  <Smartphone className="w-12 h-12 text-muted" />
                </div>
                <h3 className="text-2xl font-bold text-primary mb-3">No tienes servicios registrados</h3>
                <p className="text-muted max-w-sm leading-relaxed font-medium">
                  Agrega tus plataformas de streaming, software o servicios recurrentes para controlarlos.
                </p>
                <button type="button" className="app-btn app-btn-primary mt-5" onClick={() => setShowModal(true)}>Añadir suscripción</button>
              </motion.div>
            ) : (
              subscriptions.map((subscription, index) => {
                const urgency = getUrgencyConfig(subscription.next_billing_date);
                const isInactive = !subscription.is_active;

                return (
                  <motion.div
                    key={subscription.id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className={`compact-card group relative bg-surface  rounded-2xl border p-8 transition-all hover:-translate-y-1 ${
                      isInactive ? 'opacity-50 grayscale border-line' : `${urgency.glow} border-line hover:border-line`
                    }`}
                  >
                    {/* Header: Name & Urgency */}
                    <div className="flex items-start gap-4 relative z-10 pr-10">
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-surface-soft flex items-center justify-center border border-line text-muted group-hover:text-accent-strong transition-all">
                        <Smartphone className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black text-primary tracking-tight leading-tight group-hover:text-primary     transition-all break-words" title={subscription.name}>
                          {subscription.name}
                        </h3>
                        <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
                          {urgency.label && (
                            <span className={`px-2 py-1 rounded-lg text-xs font-black uppercase tracking-[0.1em] border bg-surface-soft ${urgency.color}`}>
                              {urgency.label}
                            </span>
                          )}
                          <span className="px-2 py-1 rounded-lg bg-surface-soft border border-line text-xs font-black text-muted uppercase tracking-[0.1em] flex items-center gap-1.5 whitespace-nowrap">
                            <Calendar className="w-3 h-3 text-muted" />
                            <span className="leading-none">{getFrequencyLabel(subscription.frequency)}</span>
                          </span>
                        </div>
                      </div>

                      {/* Absolute Action Buttons */}
                      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                        <button onClick={() => handleEdit(subscription)} className="w-8 h-8 rounded-lg bg-surface  border border-line flex items-center justify-center text-muted hover:text-primary hover:border-line transition-all shadow-xl" title="Editar">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(subscription.id)} className="w-8 h-8 rounded-lg bg-surface  border border-line flex items-center justify-center text-muted hover:text-danger hover:border-line transition-all shadow-xl" title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Price & Progress */}
                    <div className="space-y-6 relative z-10">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Monto del Ciclo</p>
                          <p className="text-3xl font-black text-primary tracking-tight">${formatMoney(subscription.amount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Próximo Cobro</p>
                          <p className={`text-sm font-black tracking-tight ${urgency.color}`}>
                            {subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Pendiente'}
                          </p>
                        </div>
                      </div>

                      {/* Info Pills */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {subscription.category_id && (
                          <div className="px-3 py-1.5 bg-surface-soft rounded-xl border border-line flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent-strong"></div>
                            <span className="text-xs font-black text-muted uppercase tracking-widest">
                              {categories.find(c => c.id === subscription.category_id)?.name}
                            </span>
                          </div>
                        )}
                        {subscription.account_id && (
                          <div className="px-3 py-1.5 bg-surface-soft rounded-xl border border-line flex items-center gap-2">
                            <CreditCard className="w-3 h-3 text-muted" />
                            <span className="text-xs font-black text-muted uppercase tracking-widest">
                              {accounts.find(a => a.id === subscription.account_id)?.name}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Action Button */}
                      {!isInactive && (
                        <button
                          onClick={() => handlePay(subscription)}
                          disabled={payingId === subscription.id}
                          className={`w-full group/btn flex items-center justify-center gap-3 py-5 rounded-[1.5rem] text-xs font-black uppercase tracking-wide transition-all relative overflow-hidden ${
                            payingId === subscription.id
                              ? 'bg-success-soft text-success opacity-70 cursor-not-allowed'
                              : 'bg-surface-soft text-success hover:bg-success-soft border border-line hover:border-line shadow-lg '
                          }`}
                        >
                          {payingId === subscription.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 transition-transform group-hover/btn:scale-110" />
                              <span>Registrar Pago</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Passive Decor */}
                    <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-opacity">
                      <ArrowUpRight className="w-8 h-8 text-primary" />
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      <SubscriptionFormModal
        isOpen={showModal}
        editingSubscription={editingSubscription}
        form={form}
        setForm={setForm}
        categories={categories}
        accounts={accounts}
        saving={saving}
        onClose={() => {
          setShowModal(false);
          setEditingSubscription(null);
          setForm(emptyForm);
        }}
        onSubmit={(e) => { e.preventDefault(); void handleSubmit(form); }}
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
        title="Cancelar Suscripción"
        message="¿Estás seguro de que quieres eliminar esta suscripción del sistema? Dejarás de rastrear sus cobros automáticos."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Subscriptions;

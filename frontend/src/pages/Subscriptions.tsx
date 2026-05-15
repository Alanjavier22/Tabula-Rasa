import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { subscriptionsAPI, categoriesAPI, accountsAPI } from '../services/api';
import type { Subscription, Category, Account, SubscriptionFrequency } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { 
  Plus, 
  Trash2, 
  Edit, 
  Calendar, 
  CreditCard, 
  CheckCircle, 
  X, 
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
import Select from '../components/common/Select';
import DatePicker from '../components/common/DatePicker';

const emptyForm = {
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
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showModal]);

  useEffect(() => {
    fetchAll();
  }, []);

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
      await subscriptionsAPI.delete(deleteConfirm.id);
      setToast({ message: 'Suscripción removida del ecosistema', type: 'success' });
      fetchAll();
    } catch (error: any) {
      console.error('Error deleting subscription:', error);
      setToast({ message: error.response?.data?.detail || 'Error al eliminar suscripción', type: 'error' });
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
      next_billing_date: subscription.next_billing_date ? subscription.next_billing_date.split('T')[0] : '',
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
      fetchAll();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    } catch (error: any) {
      console.error('Error paying subscription:', error);
      setToast({ message: error.response?.data?.detail || 'Error al registrar pago', type: 'error' });
    } finally {
      setPayingId(null);
    }
  };

  const getUrgencyConfig = (nextDate?: string) => {
    if (!nextDate) return { label: null, color: 'text-slate-400', glow: '' };
    const billing = new Date(nextDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    billing.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((billing.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { label: 'VENCIDA', color: 'text-rose-400', glow: 'shadow-[0_0_20px_rgba(244,63,94,0.3)] border-rose-500/30' };
    if (diffDays === 0) return { label: 'HOY', color: 'text-amber-400', glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)] border-amber-500/30' };
    if (diffDays <= 3) return { label: 'PRONTO', color: 'text-blue-400', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.2)] border-blue-500/30' };
    return { label: null, color: 'text-slate-400', glow: 'border-white/5' };
  };

  const handleSubmit = async (data: any) => {
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
      fetchAll();
    } catch (error: any) {
      console.error('Error saving subscription:', error);
      setToast({ message: error.response?.data?.detail || 'Error en la operación', type: 'error' });
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
      <div className="flex flex-col items-center justify-center h-[60vh] text-white">
        <Loader2 className="w-10 h-10 animate-spin text-purple-500 mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Analizando suscripciones recurrentes...</p>
      </div>
    );
  }

  const monthlyCost = calculateMonthlyCost();
  const annualCost = monthlyCost * 12;

  return (
    <div className="w-full relative min-h-screen pb-20">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[20%] -right-[10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="flex items-center gap-2 text-purple-400 text-xs font-bold tracking-[0.2em] uppercase mb-1">
              <div className="w-8 h-[1px] bg-purple-500/50"></div>
              <span>Flujo Recurrente</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
              Tus <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">Suscripciones</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium mt-2 max-w-md">
              Monitorea tus servicios digitales y optimiza tus gastos automáticos cada mes.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all transform hover:-translate-y-1"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Nueva Suscripción</span>
            </button>
          </motion.div>
        </div>

        {/* Financial Impact Dashboard */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="bg-slate-800/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Clock className="w-16 h-16 text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Impacto Mensual</p>
              <p className="text-3xl font-black text-white tracking-tight">${formatMoney(monthlyCost)}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-purple-400 text-xs font-bold">
              <TrendingUp className="w-3 h-3" />
              <span>Costo fijo proyectado</span>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <CreditCard className="w-16 h-16 text-indigo-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Impacto Anual</p>
              <p className="text-3xl font-black text-white tracking-tight">${formatMoney(annualCost)}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-indigo-400 text-xs font-bold">
              <Zap className="w-3 h-3" />
              <span>Inversión total anual</span>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 flex items-center gap-6">
            <div className="w-16 h-16 rounded-[1.5rem] bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Servicios Activos</p>
              <p className="text-3xl font-black text-white">{subscriptions.filter(s => s.is_active).length}</p>
              <p className="text-[10px] text-slate-400 mt-1 font-bold">DE UN TOTAL DE {subscriptions.length}</p>
            </div>
          </div>
        </motion.div>

        {/* Subscriptions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {subscriptions.length === 0 ? (
              <motion.div 
                className="col-span-full py-32 flex flex-col items-center text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center mb-8">
                  <Smartphone className="w-12 h-12 text-slate-600" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">No tienes servicios registrados</h3>
                <p className="text-slate-500 max-w-sm leading-relaxed font-medium">
                  Agrega tus plataformas de streaming, software o servicios recurrentes para controlarlos.
                </p>
              </motion.div>
            ) : (
              subscriptions.map((subscription, index) => {
                const urgency = getUrgencyConfig(subscription.next_billing_date);
                const isInactive = !subscription.is_active;
                
                return (
                  <motion.div
                    key={subscription.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className={`group relative bg-slate-800/30 backdrop-blur-3xl rounded-[2.5rem] border p-8 transition-all hover:-translate-y-1 ${
                      isInactive ? 'opacity-50 grayscale border-white/5' : `${urgency.glow} border-white/5 hover:border-white/10`
                    }`}
                  >
                    {/* Header: Name & Urgency */}
                    <div className="flex items-start gap-4 relative z-10 pr-10">
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 text-slate-400 group-hover:text-purple-400 transition-all">
                        <Smartphone className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-black text-white tracking-tight leading-tight group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all break-words" title={subscription.name}>
                          {subscription.name}
                        </h3>
                        <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
                          {urgency.label && (
                            <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-[0.1em] border bg-white/5 ${urgency.color}`}>
                              {urgency.label}
                            </span>
                          )}
                          <span className="px-2 py-1 rounded-lg bg-black/20 border border-white/5 text-[8px] font-black text-slate-500 uppercase tracking-[0.1em] flex items-center gap-1.5 whitespace-nowrap">
                            <Calendar className="w-3 h-3 text-slate-500" /> 
                            <span className="leading-none">{getFrequencyLabel(subscription.frequency)}</span>
                          </span>
                        </div>
                      </div>

                      {/* Absolute Action Buttons */}
                      <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-1 group-hover:translate-x-0">
                        <button onClick={() => handleEdit(subscription)} className="w-8 h-8 rounded-lg bg-slate-800/90 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-white/20 transition-all shadow-xl" title="Editar">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(subscription.id)} className="w-8 h-8 rounded-lg bg-slate-800/90 backdrop-blur-md border border-white/10 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:border-rose-500/30 transition-all shadow-xl" title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Price & Progress */}
                    <div className="space-y-6 relative z-10">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Monto del Ciclo</p>
                          <p className="text-3xl font-black text-white tracking-tight">${formatMoney(subscription.amount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Próximo Cobro</p>
                          <p className={`text-sm font-black tracking-tight ${urgency.color}`}>
                            {subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Pendiente'}
                          </p>
                        </div>
                      </div>

                      {/* Info Pills */}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {subscription.category_id && (
                          <div className="px-3 py-1.5 bg-black/20 rounded-xl border border-white/5 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              {categories.find(c => c.id === subscription.category_id)?.name}
                            </span>
                          </div>
                        )}
                        {subscription.account_id && (
                          <div className="px-3 py-1.5 bg-black/20 rounded-xl border border-white/5 flex items-center gap-2">
                            <CreditCard className="w-3 h-3 text-slate-500" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
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
                          className={`w-full group/btn flex items-center justify-center gap-3 py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden ${
                            payingId === subscription.id
                              ? 'bg-emerald-900 text-emerald-200 opacity-70 cursor-not-allowed'
                              : 'bg-white/5 text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/40 shadow-lg hover:shadow-emerald-500/10'
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
                      <ArrowUpRight className="w-8 h-8 text-white" />
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Modern Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowModal(false);
                setEditingSubscription(null);
                setForm(emptyForm);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-xl bg-slate-900 rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
                    <Smartphone className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
                      {editingSubscription ? 'Ajustar Suscripción' : 'Nueva Suscripción'}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Parámetros del Servicio</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowModal(false);
                    setEditingSubscription(null);
                    setForm(emptyForm);
                  }} 
                  className="w-10 h-10 md:w-12 md:h-12 rounded-2xl hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all"
                >
                  <X className="w-6 h-6 md:w-8 md:h-8" />
                </button>
              </div>

              <form 
                onSubmit={(e) => { e.preventDefault(); handleSubmit(form); }} 
                className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain"
              >
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Nombre del Servicio</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-bold focus:outline-none focus:border-purple-500/50 transition-all text-lg"
                      placeholder="Ej: Netflix, Spotify, AWS..."
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Monto por Ciclo ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-white font-black focus:outline-none focus:border-purple-500/50 transition-all text-2xl"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Ciclo de Facturación</label>
                      <Select
                        value={form.frequency}
                        onChange={(value) => setForm({ ...form, frequency: value as SubscriptionFrequency })}
                        options={[
                          { value: 'weekly', label: 'Semanal' },
                          { value: 'monthly', label: 'Mensual' },
                          { value: 'quarterly', label: 'Trimestral' },
                          { value: 'yearly', label: 'Anual' }
                        ]}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Próximo Cobro</label>
                      <DatePicker
                        value={form.next_billing_date}
                        onChange={(value) => setForm({ ...form, next_billing_date: value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Cuenta de Cargo</label>
                      <Select
                        value={form.account_id}
                        onChange={(value) => setForm({ ...form, account_id: value })}
                        options={[
                          { value: '', label: 'Sin cuenta' },
                          ...accounts.map((acc) => ({ value: acc.id, label: acc.name }))
                        ]}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 ml-1">Categoría del Gasto</label>
                    <Select
                      value={form.category_id}
                      onChange={(value) => setForm({ ...form, category_id: value })}
                      options={[
                        { value: '', label: 'Sin categoría' },
                        ...categories.map((cat) => ({ value: cat.id, label: cat.name }))
                      ]}
                    />
                  </div>

                  <div className="flex items-center gap-4 px-4 py-2">
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        id="isActiveToggleSub"
                        checked={form.is_active}
                        onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                      <span className="ml-3 text-xs font-black text-slate-300 uppercase tracking-widest cursor-pointer select-none">Suscripción Activa</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingSubscription(null);
                      setForm(emptyForm);
                    }}
                    className="flex-1 px-8 py-5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-[2] px-8 py-5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-xl hover:shadow-purple-500/20 transition-all disabled:opacity-50"
                  >
                    {saving ? 'Procesando...' : editingSubscription ? 'Actualizar Servicio' : 'Activar Suscripción'}
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
        title="Cancelar Suscripción"
        message="¿Estás seguro de que quieres eliminar esta suscripción del sistema? Dejarás de rastrear sus cobros automáticos."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Subscriptions;

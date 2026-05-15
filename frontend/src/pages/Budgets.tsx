import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { budgetsAPI, categoriesAPI, transactionsAPI, accountsAPI } from '../services/api';
import type { Budget, Category, Account, TransactionType, PaymentMethod, ExpenseType } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { 
  Plus, 
  Trash2, 
  Edit, 
  PieChart, 
  X, 
  Check, 
  RefreshCw, 
  TrendingUp, 
  AlertCircle, 
  Wallet
} from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import TransactionForm from '../components/TransactionForm';
import Select from '../components/common/Select';

const emptyForm = {
  name: '',
  amount: '',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  category_id: '',
};

const Budgets = () => {
  const queryClient = useQueryClient();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [recurringForm, setRecurringForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    delete_previous: true,
  });
  const [paymentForm, setPaymentForm] = useState({
    description: '',
    amount: '',
    transaction_type: 'expense' as TransactionType,
    payment_method: 'transfer' as PaymentMethod,
    date: new Date().toISOString().split('T')[0],
    category_id: '',
    account_id: '',
    expense_type: 'fixed' as ExpenseType,
  });
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [paymentBudget, setPaymentBudget] = useState<Budget | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });

  // Bloquear scroll del body cuando cualquier modal esté abierto
  useEffect(() => {
    if (showCreateModal || showEditModal || showPaymentModal || showRecurringModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showCreateModal, showEditModal, showPaymentModal, showRecurringModal]);

  useEffect(() => {
    fetchBudgets();
    fetchCategories();
    fetchAccounts();
  }, []);

  const fetchBudgets = async () => {
    try {
      const response = await budgetsAPI.getAll();
      setBudgets(response.data);
    } catch (error) {
      console.error('Error fetching budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await accountsAPI.getAll();
      setAccounts(response.data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    try {
      await budgetsAPI.delete(deleteConfirm.id);
      setToast({ message: 'Presupuesto eliminado', type: 'success' });
      fetchBudgets();
    } catch (error) {
      console.error('Error deleting budget:', error);
      setToast({ message: 'Error al eliminar presupuesto', type: 'error' });
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setEditForm({
      name: budget.name,
      amount: (budget.amount / 100).toString(),
      month: budget.month,
      year: budget.year,
      category_id: budget.category_id?.toString() || '',
    });
    setShowEditModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await budgetsAPI.create({
        name: form.name,
        amount: toCents(form.amount),
        month: form.month,
        year: form.year,
        category_id: form.category_id || null,
      });
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Presupuesto creado con éxito', type: 'success' });
      fetchBudgets();
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    } catch (error) {
      console.error('Error creating budget:', error);
      setToast({ message: 'Error al crear presupuesto', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBudget) return;
    setSaving(true);
    try {
      await budgetsAPI.update(editingBudget.id, {
        name: editForm.name,
        amount: toCents(editForm.amount),
        month: editForm.month,
        year: editForm.year,
        category_id: editForm.category_id || null,
      });
      setShowEditModal(false);
      setEditingBudget(null);
      setEditForm(emptyForm);
      setToast({ message: 'Presupuesto actualizado', type: 'success' });
      fetchBudgets();
    } catch (error) {
      console.error('Error updating budget:', error);
      setToast({ message: 'Error al actualizar presupuesto', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickPayment = (budget: Budget) => {
    const remaining = budget.amount - budget.spent;
    setPaymentBudget(budget);
    setPaymentForm({
      description: budget.name,
      amount: remaining > 0 ? (remaining / 100).toString() : (budget.amount / 100).toString(),
      transaction_type: 'expense' as TransactionType,
      payment_method: 'transfer' as PaymentMethod,
      date: new Date().toISOString().split('T')[0],
      category_id: budget.category_id?.toString() || '',
      account_id: '',
      expense_type: 'fixed' as ExpenseType,
    });
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async (data: any) => {
    setSaving(true);
    try {
      await transactionsAPI.create({
        description: data.description,
        amount: toCents(data.amount),
        transaction_type: data.transaction_type,
        payment_method: data.payment_method,
        date: data.date + 'T00:00:00',
        category_id: data.category_id || null,
        account_id: data.account_id || null,
        expense_type: data.transaction_type === 'expense' ? data.expense_type : null,
      });
      setShowPaymentModal(false);
      setPaymentBudget(null);
      setToast({ message: 'Pago registrado y presupuesto actualizado', type: 'success' });
      fetchBudgets();
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    } catch (error) {
      console.error('Error creating payment transaction:', error);
      setToast({ message: 'Error al registrar pago', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/budgets/generate-recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recurringForm),
      });

      if (response.ok) {
        setToast({ message: 'Ecosistema de presupuestos sincronizado', type: 'success' });
        setShowRecurringModal(false);
        fetchBudgets();
      } else {
        const error = await response.json();
        setToast({ message: error.detail || 'Error al generar recurrentes', type: 'error' });
      }
    } catch (error) {
      console.error('Error generating recurring budgets:', error);
      setToast({ message: 'Error de conexión con el servidor', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Stats for the header
  const totalBudgeted = budgets.reduce((acc, b) => acc + b.amount, 0);
  const totalSpent = budgets.reduce((acc, b) => acc + b.spent, 0);
  const overallPercentage = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-white">
        <RefreshCw className="w-10 h-10 animate-spin text-purple-500 mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Analizando límites financieros...</p>
      </div>
    );
  }

  return (
    <div className="w-full relative min-h-screen pb-20">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[10%] -left-[10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[20%] -right-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="flex items-center gap-2 text-purple-400 text-xs font-bold tracking-[0.2em] uppercase mb-1">
              <div className="w-8 h-[1px] bg-purple-500/50"></div>
              <span>Control de Límites</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight">
              Tus <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Presupuestos</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium mt-2 max-w-md">
              Gestiona tus techos de gasto y mantén tu salud financiera bajo control este mes.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-wrap gap-3"
          >
            <button 
              onClick={() => setShowRecurringModal(true)} 
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all group"
            >
              <RefreshCw className="w-4 h-4 text-emerald-400 group-hover:rotate-180 transition-transform duration-700" />
              <span className="text-xs font-black uppercase tracking-widest">Sincronizar Mes</span>
            </button>
            <button 
              onClick={() => setShowCreateModal(true)} 
              className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all transform hover:-translate-y-1"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Nuevo Límite</span>
            </button>
          </motion.div>
        </div>

        {/* Global Stats Summary */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="bg-slate-800/40 backdrop-blur-2xl p-6 rounded-[2rem] border border-white/5 flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
              <PieChart className="w-7 h-7 text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Presupuesto Total</p>
              <p className="text-2xl font-black text-white">${formatMoney(totalBudgeted)}</p>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-2xl p-6 rounded-[2rem] border border-white/5 flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <TrendingUp className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Consumido</p>
              <p className="text-2xl font-black text-white">${formatMoney(totalSpent)}</p>
            </div>
          </div>

          <div className="bg-slate-800/40 backdrop-blur-2xl p-6 rounded-[2rem] border border-white/5">
            <div className="flex justify-between items-end mb-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Utilización Global</p>
              <p className={`text-sm font-black ${overallPercentage > 90 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {overallPercentage.toFixed(1)}%
              </p>
            </div>
            <div className="w-full bg-black/40 rounded-full h-2.5 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(overallPercentage, 100)}%` }}
                className={`h-full rounded-full ${
                  overallPercentage > 90 ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                }`}
              />
            </div>
          </div>
        </motion.div>

        {/* Budgets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {budgets.length === 0 ? (
              <motion.div 
                className="col-span-full py-20 flex flex-col items-center text-center bg-white/5 rounded-[3rem] border border-dashed border-white/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center mb-6">
                  <PieChart className="w-10 h-10 text-slate-600" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Sin límites definidos</h3>
                <p className="text-slate-500 max-w-xs leading-relaxed">
                  Configura tus presupuestos para que el asistente pueda avisarte cuando te acerques al borde.
                </p>
              </motion.div>
            ) : (
              budgets.map((budget, index) => {
                const percentage = (budget.spent / budget.amount) * 100;
                const remaining = budget.amount - budget.spent;
                const isOverBudget = remaining < 0;
                
                return (
                  <motion.div
                    key={budget.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className="group bg-slate-800/30 backdrop-blur-3xl rounded-[2.5rem] border border-white/5 hover:border-white/10 transition-all p-8 relative overflow-hidden"
                  >
                    {/* Background Visual Decor */}
                    <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-10 transition-all group-hover:opacity-20 ${
                      isOverBudget ? 'bg-rose-600' : percentage > 80 ? 'bg-yellow-600' : 'bg-blue-600'
                    }`}></div>

                    <div className="flex items-start justify-between mb-8 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                          isOverBudget 
                            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                            : 'bg-white/5 border-white/10 text-slate-400 group-hover:text-white'
                        }`}>
                          <PieChart className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-white tracking-tight leading-tight">{budget.name}</h3>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                            Límite {budget.month < 10 ? `0${budget.month}` : budget.month}/{budget.year}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <button 
                          onClick={() => handleQuickPayment(budget)} 
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-400 transition-all"
                          title="Registrar Gasto"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEdit(budget)} 
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(budget.id)} 
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                      <div>
                        <div className="flex justify-between items-end mb-3">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Gastado Real</span>
                            <span className="text-xl font-black text-white tracking-tight">${formatMoney(budget.spent)}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Techo</span>
                            <span className="text-sm font-bold text-slate-400">${formatMoney(budget.amount)}</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(percentage, 100)}%` }}
                            className={`h-full rounded-full transition-all duration-700 ${
                              isOverBudget 
                                ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]' 
                                : percentage > 85
                                ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)]'
                                : 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                            }`}
                          />
                        </div>
                      </div>

                      <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                        isOverBudget 
                          ? 'bg-rose-500/10 border-rose-500/20' 
                          : 'bg-black/20 border-white/5'
                      }`}>
                        <div className={`p-2 rounded-lg ${isOverBudget ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {isOverBudget ? <AlertCircle className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            {isOverBudget ? 'Excedido por' : 'Disponible'}
                          </p>
                          <p className={`text-sm font-black ${isOverBudget ? 'text-rose-400' : 'text-white'}`}>
                            ${formatMoney(Math.abs(remaining))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Uso</p>
                          <p className="text-sm font-black text-slate-300">{percentage.toFixed(0)}%</p>
                        </div>
                      </div>
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
        {(showCreateModal || showEditModal || showRecurringModal) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowCreateModal(false);
                setShowEditModal(false);
                setShowRecurringModal(false);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                    {showRecurringModal ? <RefreshCw className="w-5 h-5 text-purple-400" /> : <Plus className="w-5 h-5 text-purple-400" />}
                  </div>
                  <div>
                    <h2 className="text-lg md:text-xl font-black text-white tracking-tight">
                      {showCreateModal ? 'Nuevo Límite' : showEditModal ? 'Ajustar Límite' : 'Generar Recurrente'}
                    </h2>
                    <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Configuración de Presupuesto</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    setShowRecurringModal(false);
                  }} 
                  className="w-10 h-10 rounded-xl hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {showCreateModal && (
                <form onSubmit={handleCreateSubmit} className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Nombre del Presupuesto</label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-bold focus:outline-none focus:border-purple-500/50 transition-all"
                        placeholder="Ej: Alimentación, Ocio, Servicios..."
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Monto Máximo ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={form.amount}
                        onChange={e => setForm({...form, amount: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-bold focus:outline-none focus:border-purple-500/50 transition-all text-xl"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Mes Vigencia</label>
                        <Select
                          value={form.month.toString()}
                          onChange={(value) => setForm({...form, month: parseInt(value)})}
                          options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Año</label>
                        <Select
                          value={form.year.toString()}
                          onChange={(value) => setForm({...form, year: parseInt(value)})}
                          options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Vincular Categoría</label>
                      <Select
                        value={form.category_id}
                        onChange={(value) => setForm({...form, category_id: value})}
                        options={[
                          { value: '', label: 'Sin categoría vinculada' },
                          ...categories.map(c => ({ value: c.id, label: c.name }))
                        ]}
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-[2] px-6 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Confirmar Presupuesto'}
                    </button>
                  </div>
                </form>
              )}

              {showEditModal && (
                <form onSubmit={handleEditSubmit} className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Nombre</label>
                      <input
                        type="text"
                        required
                        value={editForm.name}
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-bold focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Monto ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={editForm.amount}
                        onChange={e => setEditForm({...editForm, amount: e.target.value})}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white font-bold focus:outline-none focus:border-purple-500/50 text-xl"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Mes</label>
                        <Select
                          value={editForm.month.toString()}
                          onChange={(value) => setEditForm({...editForm, month: parseInt(value)})}
                          options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Año</label>
                        <Select
                          value={editForm.year.toString()}
                          onChange={(value) => setEditForm({...editForm, year: parseInt(value)})}
                          options={[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Categoría</label>
                      <Select
                        value={editForm.category_id}
                        onChange={(value) => setEditForm({...editForm, category_id: value})}
                        options={[
                          { value: '', label: 'Sin categoría' },
                          ...categories.map(c => ({ value: c.id, label: c.name }))
                        ]}
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowEditModal(false)}
                      className="flex-1 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-[2] px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:shadow-lg transition-all"
                    >
                      {saving ? 'Guardando...' : 'Actualizar Límites'}
                    </button>
                  </div>
                </form>
              )}

              {showRecurringModal && (
                <form onSubmit={handleGenerateRecurring} className="p-6 md:p-8 space-y-6 overflow-y-auto custom-scrollbar overscroll-contain">
                  <div className="p-5 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 mb-2">
                    <div className="flex gap-4">
                      <div className="p-2 h-fit bg-emerald-500/10 rounded-xl text-emerald-400">
                        <RefreshCw className="w-5 h-5" />
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Esta acción copiará los presupuestos definidos en el mes anterior al mes actual, permitiéndote mantener tus metas sin reconfigurar todo.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Destino: Mes</label>
                      <Select
                        value={recurringForm.month.toString()}
                        onChange={(value) => setRecurringForm({...recurringForm, month: parseInt(value)})}
                        options={Array.from({length: 12}, (_, i) => ({ value: (i + 1).toString(), label: (i + 1).toString() }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 ml-1">Destino: Año</label>
                      <Select
                        value={recurringForm.year.toString()}
                        onChange={(value) => setRecurringForm({...recurringForm, year: parseInt(value)})}
                        options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: year.toString(), label: year.toString() }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-black/20 rounded-2xl border border-white/5">
                    <input
                      type="checkbox"
                      id="delete_previous"
                      checked={recurringForm.delete_previous}
                      onChange={e => setRecurringForm({...recurringForm, delete_previous: e.target.checked})}
                      className="w-5 h-5 rounded-lg border-white/10 bg-slate-900 text-emerald-500 focus:ring-emerald-500/50 transition-all"
                    />
                    <label htmlFor="delete_previous" className="text-xs font-bold text-slate-300 cursor-pointer">
                      Limpiar registros previos del mes destino
                    </label>
                  </div>
                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowRecurringModal(false)}
                      className="flex-1 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-black uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-[2] px-6 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-900/20"
                    >
                      {saving ? 'Procesando...' : 'Sincronizar Mes'}
                    </button>
                  </div>
                </form>
              )}
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
        title="Eliminar Presupuesto"
        message="¿Estás seguro de que quieres eliminar este presupuesto? El historial de gastos no se borrará, pero perderás el seguimiento del límite."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />

      {showPaymentModal && paymentBudget && (
        <TransactionForm
          initialData={paymentForm}
          categories={categories}
          accounts={accounts}
          onSubmit={handlePaymentSubmit}
          onCancel={() => setShowPaymentModal(false)}
          saving={saving}
          title="Registro de Gasto Presupuestado"
        />
      )}
    </div>
  );
};

export default Budgets;

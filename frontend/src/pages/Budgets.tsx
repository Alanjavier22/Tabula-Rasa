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
  Check,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  Wallet
} from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import TransactionForm from '../components/TransactionForm';
import type { TransactionFormData } from '../components/TransactionForm';
import type { AxiosError } from 'axios';
import BudgetFormModal, { type BudgetFormData } from '../components/budgets/BudgetFormModal';

const emptyForm: BudgetFormData = {
  name: '',
  amount: '',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  category_id: '',
};

const getBudgetGlowClass = (isOverBudget: boolean, percentage: number) => {
  if (isOverBudget) return 'bg-danger';
  if (percentage > 80) return 'bg-warning';
  return 'bg-info';
};

const getBudgetProgressClass = (isOverBudget: boolean, percentage: number) => {
  if (isOverBudget) return 'bg-danger ';
  if (percentage > 85) return 'bg-warning ';
  return 'bg-accent-strong';
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


  const fetchBudgets = async () => {
    try {
      const response = await budgetsAPI.getAll();
      setBudgets(response.data);
    } catch (error) {
      console.error('Error fetching budgets:', error);
      setToast({ message: 'No se pudieron cargar los presupuestos', type: 'error' });
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
      setToast({ message: 'No se pudieron cargar las categorías', type: 'error' });
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await accountsAPI.getAll();
      setAccounts(response.data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setToast({ message: 'No se pudieron cargar las cuentas', type: 'error' });
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([fetchBudgets(), fetchCategories(), fetchAccounts()]));
  }, []);

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;
    try {
      await budgetsAPI.delete(deleteConfirm.id);
      setToast({ message: 'Presupuesto eliminado', type: 'success' });
      void fetchBudgets();
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
        category_id: form.category_id || undefined,
      });
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Presupuesto creado con éxito', type: 'success' });
      void fetchBudgets();
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
        category_id: editForm.category_id || undefined,
      });
      setShowEditModal(false);
      setEditingBudget(null);
      setEditForm(emptyForm);
      setToast({ message: 'Presupuesto actualizado', type: 'success' });
      void fetchBudgets();
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

  const handlePaymentSubmit = async (data: TransactionFormData) => {
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
      void fetchBudgets();
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
      await budgetsAPI.generateRecurring(recurringForm);
      setToast({ message: 'Ecosistema de presupuestos sincronizado', type: 'success' });
      setShowRecurringModal(false);
      void fetchBudgets();
    } catch (error) {
      console.error('Error generating recurring budgets:', error);
      const errorMessage = (error as AxiosError<{ detail?: string }>).response?.data?.detail || 'Error al generar recurrentes';
      setToast({ message: errorMessage, type: 'error' });
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
      <div className="flex flex-col items-center justify-center h-[60vh] text-primary">
        <RefreshCw className="w-10 h-10 animate-spin text-accent-strong mb-4" />
        <p className="text-muted font-medium animate-pulse">Analizando límites financieros...</p>
      </div>
    );
  }

  return (
    <div className="budgets-page compact-page w-full relative min-h-screen pb-20">
      {/* Background Decor */}


      <div className="compact-page-content relative z-10 max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="compact-page-header flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={false} animate={{ opacity: 1, x: 0 }}>

            <h1 className="text-4xl lg:text-5xl font-black text-primary tracking-tight">Presupuestos</h1>
            <p className="text-muted text-sm lg:text-base font-medium mt-2 max-w-md">
              Gestiona tus techos de gasto y mantén tu salud financiera bajo control este mes.
            </p>
          </motion.div>

          <motion.div
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            className="compact-page-actions flex flex-wrap gap-3"
          >
            <button
              onClick={() => setShowRecurringModal(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface-soft hover:bg-surface-soft border border-line text-primary transition-all group"
            >
              <RefreshCw className="w-4 h-4 text-success group-hover:rotate-180 transition-transform duration-700" />
              <span className="text-xs font-black uppercase tracking-widest">Sincronizar Mes</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="app-btn app-btn-primary"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">Nuevo presupuesto</span>
            </button>
          </motion.div>
        </div>

        {/* Global Stats Summary */}
        <motion.div
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="compact-summary grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="compact-summary-card bg-surface  p-6 rounded-2xl border border-line flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center border border-line">
              <PieChart className="w-7 h-7 text-accent-strong" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Presupuesto Total</p>
              <p className="text-2xl font-black text-primary">${formatMoney(totalBudgeted)}</p>
            </div>
          </div>

          <div className="compact-summary-card bg-surface  p-6 rounded-2xl border border-line flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-info-soft flex items-center justify-center border border-line">
              <TrendingUp className="w-7 h-7 text-info" />
            </div>
            <div>
              <p className="text-xs font-black text-muted uppercase tracking-widest mb-1">Consumido</p>
              <p className="text-2xl font-black text-primary">${formatMoney(totalSpent)}</p>
            </div>
          </div>

          <div className="compact-summary-card bg-surface  p-6 rounded-2xl border border-line">
            <div className="flex justify-between items-end mb-2">
              <p className="text-xs font-black text-muted uppercase tracking-widest">Utilización Global</p>
              <p className={`text-sm font-black ${overallPercentage > 90 ? 'text-danger' : 'text-success'}`}>
                {overallPercentage.toFixed(1)}%
              </p>
            </div>
            <div className="w-full bg-surface-soft rounded-full h-2.5 overflow-hidden">
              <motion.div
                initial={false}
                animate={{ width: `${Math.min(overallPercentage, 100)}%` }}
                className={`h-full rounded-full ${
                  overallPercentage > 90 ? 'bg-danger ' : 'bg-success '
                }`}
              />
            </div>
          </div>
        </motion.div>

        {/* Budgets Grid */}
        <div className="compact-page-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AnimatePresence mode="popLayout">
            {budgets.length === 0 ? (
              <motion.div
                className="compact-empty col-span-full py-20 flex flex-col items-center text-center bg-surface-soft rounded-2xl border border-dashed border-line"
                initial={false}
                animate={{ opacity: 1 }}
              >
                <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center mb-6">
                  <PieChart className="w-10 h-10 text-muted" />
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">Aún no hay presupuestos</h3>
                <p className="text-muted max-w-xs leading-relaxed">
                  Configura tus presupuestos para que el asistente pueda avisarte cuando te acerques al borde.
                </p>
                <button type="button" className="app-btn app-btn-primary mt-5" onClick={() => setShowCreateModal(true)}>Crear presupuesto</button>
              </motion.div>
            ) : (
              budgets.map((budget, index) => {
                const percentage = (budget.spent / budget.amount) * 100;
                const remaining = budget.amount - budget.spent;
                const isOverBudget = remaining < 0;

                return (
                  <motion.div
                    key={budget.id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.05 }}
                    className="compact-card group bg-surface  rounded-2xl border border-line hover:border-line transition-all p-8 relative overflow-hidden"
                  >
                    {/* Background Visual Decor */}
                    <div className={`absolute top-0 right-0 w-32 h-32  opacity-10 transition-all group-hover:opacity-20 ${getBudgetGlowClass(isOverBudget, percentage)}`}></div>

                    <div className="flex items-start justify-between mb-8 relative z-10">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                          isOverBudget
                            ? 'bg-danger-soft border-line text-danger'
                            : 'bg-surface-soft border-line text-muted group-hover:text-primary'
                        }`}>
                          <PieChart className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-primary tracking-tight leading-tight">{budget.name}</h3>
                          <p className="text-xs font-black text-muted uppercase tracking-widest mt-1">
                            Límite {budget.month < 10 ? `0${budget.month}` : budget.month}/{budget.year}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <button
                          onClick={() => handleQuickPayment(budget)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-success-soft text-muted hover:text-success transition-all"
                          title="Registrar Gasto"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(budget)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-info-soft text-muted hover:text-info transition-all"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(budget.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-danger-soft text-muted hover:text-danger transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                      <div>
                        <div className="flex justify-between items-end mb-3">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-muted uppercase tracking-widest mb-0.5">Gastado Real</span>
                            <span className="text-xl font-black text-primary tracking-tight">${formatMoney(budget.spent)}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-muted uppercase tracking-widest mb-0.5">Techo</span>
                            <span className="text-sm font-bold text-muted">${formatMoney(budget.amount)}</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 w-full bg-surface-soft rounded-full overflow-hidden">
                          <motion.div
                            initial={false}
                            animate={{ width: `${Math.min(percentage, 100)}%` }}
                            className={`h-full rounded-full transition-all duration-700 ${getBudgetProgressClass(isOverBudget, percentage)}`}
                          />
                        </div>
                      </div>

                      <div className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                        isOverBudget
                          ? 'bg-danger-soft border-line'
                          : 'bg-surface-soft border-line'
                      }`}>
                        <div className={`p-2 rounded-lg ${isOverBudget ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'}`}>
                          {isOverBudget ? <AlertCircle className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-black text-muted uppercase tracking-widest">
                            {isOverBudget ? 'Excedido por' : 'Disponible'}
                          </p>
                          <p className={`text-sm font-black ${isOverBudget ? 'text-danger' : 'text-primary'}`}>
                            ${formatMoney(Math.abs(remaining))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-muted uppercase tracking-widest">Uso</p>
                          <p className="text-sm font-black text-muted">{percentage.toFixed(0)}%</p>
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

      <BudgetFormModal
        showCreateModal={showCreateModal}
        showEditModal={showEditModal}
        showRecurringModal={showRecurringModal}
        form={form}
        setForm={setForm}
        editForm={editForm}
        setEditForm={setEditForm}
        recurringForm={recurringForm}
        setRecurringForm={setRecurringForm}
        categories={categories}
        saving={saving}
        onClose={() => {
          setShowCreateModal(false);
          setShowEditModal(false);
          setShowRecurringModal(false);
        }}
        onCreateSubmit={handleCreateSubmit}
        onEditSubmit={handleEditSubmit}
        onGenerateRecurring={handleGenerateRecurring}
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
        title="Eliminar Presupuesto"
        message="¿Estás seguro de que quieres eliminar este presupuesto? El historial de gastos no se borrará, pero perderás el seguimiento del límite."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />

      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  );
};

export default Budgets;

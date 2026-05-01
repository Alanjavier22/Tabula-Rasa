import { useEffect, useState } from 'react';
import { budgetsAPI, categoriesAPI, transactionsAPI, accountsAPI } from '../services/api';
import type { Budget, Category, Account, TransactionType, PaymentMethod, ExpenseType } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { Plus, Trash2, Edit, PieChart, X, Check } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import TransactionForm from '../components/TransactionForm';

const emptyForm = {
  name: '',
  amount: '',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  category_id: '',
};

const Budgets = () => {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
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
      // Backend returns cents, divide by 100 for display
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
        // Convert user input (dollars) to cents for backend
        amount: toCents(form.amount),
        month: form.month,
        year: form.year,
        category_id: form.category_id || null,
      });
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Presupuesto creado', type: 'success' });
      fetchBudgets();
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
        // Convert user input (dollars) to cents for backend
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
      // Backend returns cents, divide by 100 for display in form
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
        // Convert user input (dollars) to cents for backend
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
      setToast({ message: 'Pago registrado exitosamente', type: 'success' });
      fetchBudgets();
    } catch (error) {
      console.error('Error creating payment transaction:', error);
      setToast({ message: 'Error al registrar pago', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 lg:mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Presupuestos</h1>
          <p className="text-slate-300 text-sm lg:text-base">Configura y rastrea tus presupuestos mensuales</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap">
          <Plus className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
          Agregar Presupuesto
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {budgets.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-slate-400 text-lg">No hay presupuestos configurados</p>
            <p className="text-slate-500 text-sm mt-2">Crea presupuestos para controlar tus límites de gasto</p>
          </div>
        ) : (
          budgets.map((budget) => {
            const percentage = (budget.spent / budget.amount) * 100;
            const remaining = budget.amount - budget.spent;
            const isOverBudget = remaining < 0;

            return (
              <div
                key={budget.id}
                className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 hover:border-purple-500/50 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="bg-purple-500/20 p-3 rounded-full mr-3">
                      <PieChart className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{budget.name}</h3>
                      <p className="text-sm text-slate-300">
                        {budget.month}/{budget.year}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => handleQuickPayment(budget)} className="text-green-400 hover:text-green-300" title="Registrar Pago">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEdit(budget)} className="text-blue-400 hover:text-blue-300">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(budget.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-slate-400">Gastado</span>
                    <span className="text-sm font-semibold text-white">
                      ${formatMoney(budget.spent)} / ${formatMoney(budget.amount)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        isOverBudget
                          ? 'bg-gradient-to-r from-red-600 to-red-400'
                          : percentage > 90
                          ? 'bg-gradient-to-r from-yellow-600 to-yellow-400'
                          : 'bg-gradient-to-r from-green-600 to-green-400'
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-slate-400">{percentage.toFixed(0)}%</span>
                    <span
                      className={`text-xs font-semibold ${
                        isOverBudget ? 'text-red-400' : 'text-green-400'
                      }`}
                    >
                      {isOverBudget
                        ? `Excedido por ${formatMoney(Math.abs(remaining))}`
                        : `${formatMoney(remaining)} restantes`}
                    </span>
                  </div>
                </div>
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
              <h2 className="text-xl font-bold text-white">Nuevo Presupuesto</h2>
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
                  placeholder="Ej: Comida mensual"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={form.amount}
                  onChange={e => setForm({...form, amount: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="0.00"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Mes *</label>
                  <select
                    value={form.month}
                    onChange={e => setForm({...form, month: parseInt(e.target.value)})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    {Array.from({length: 12}, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Año *</label>
                  <select
                    value={form.year}
                    onChange={e => setForm({...form, year: parseInt(e.target.value)})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Categoría</label>
                <select
                  value={form.category_id}
                  onChange={e => setForm({...form, category_id: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="">Sin categoría</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
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
      {showEditModal && editingBudget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Editar Presupuesto</h2>
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
              <div>
                <label className="block text-sm text-slate-300 mb-1">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={editForm.amount}
                  onChange={e => setEditForm({...editForm, amount: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Mes *</label>
                  <select
                    value={editForm.month}
                    onChange={e => setEditForm({...editForm, month: parseInt(e.target.value)})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    {Array.from({length: 12}, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Año *</label>
                  <select
                    value={editForm.year}
                    onChange={e => setEditForm({...editForm, year: parseInt(e.target.value)})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Categoría</label>
                <select
                  value={editForm.category_id}
                  onChange={e => setEditForm({...editForm, category_id: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="">Sin categoría</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
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
        title="Eliminar Presupuesto"
        message="¿Estás seguro de que quieres eliminar este presupuesto? Esta acción no se puede deshacer."
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
          title="Registrar Pago de Presupuesto"
        />
      )}
    </div>
  );
};

export default Budgets;

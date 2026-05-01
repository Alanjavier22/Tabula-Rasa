import { useEffect, useState } from 'react';
import { subscriptionsAPI, categoriesAPI, accountsAPI } from '../services/api';
import type { Subscription, Category, Account, SubscriptionFrequency } from '../types';
import { formatMoney, toCents } from '../utils/money';
import { Plus, Trash2, Edit, Calendar, CreditCard } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

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
      setToast({ message: 'Suscripción eliminada', type: 'success' });
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
      // Backend returns cents, divide by 100 for display
      amount: (subscription.amount / 100).toString(),
      frequency: subscription.frequency,
      next_billing_date: subscription.next_billing_date ? subscription.next_billing_date.split('T')[0] : '',
      account_id: subscription.account_id?.toString() || '',
      category_id: subscription.category_id?.toString() || '',
      is_active: subscription.is_active,
    });
    setShowModal(true);
  };

  const handleSubmit = async (data: any) => {
    setSaving(true);
    try {
      if (editingSubscription) {
        await subscriptionsAPI.update(editingSubscription.id, {
          name: data.name,
          // Convert user input (dollars) to cents for backend
          amount: toCents(data.amount),
          frequency: data.frequency,
          next_billing_date: data.next_billing_date ? data.next_billing_date + 'T00:00:00' : null,
          account_id: data.account_id ? parseInt(data.account_id) : null,
          category_id: data.category_id ? parseInt(data.category_id) : null,
          is_active: data.is_active,
        });
        setToast({ message: 'Suscripción actualizada', type: 'success' });
      } else {
        await subscriptionsAPI.create({
          name: data.name,
          // Convert user input (dollars) to cents for backend
          amount: toCents(data.amount),
          frequency: data.frequency,
          next_billing_date: data.next_billing_date ? data.next_billing_date + 'T00:00:00' : null,
          account_id: data.account_id ? parseInt(data.account_id) : null,
          category_id: data.category_id ? parseInt(data.category_id) : null,
          is_active: data.is_active,
        });
        setToast({ message: 'Suscripción creada', type: 'success' });
      }
      setShowModal(false);
      setEditingSubscription(null);
      setForm(emptyForm);
      fetchAll();
    } catch (error: any) {
      console.error('Error saving subscription:', error);
      setToast({ message: error.response?.data?.detail || (editingSubscription ? 'Error al actualizar suscripción' : 'Error al crear suscripción'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const calculateAnnualCost = () => {
    return subscriptions.reduce((total, sub) => {
      const multiplier = {
        weekly: 52,
        monthly: 12,
        quarterly: 4,
        yearly: 1,
      }[sub.frequency] || 12;
      return total + (sub.amount * multiplier);
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
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  const annualCost = calculateAnnualCost();

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 lg:mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Suscripciones</h1>
          <p className="text-slate-300 text-sm lg:text-base">Gestiona tus suscripciones recurrentes</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap"
        >
          <Plus className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
          Agregar Suscripción
        </button>
      </div>

      {/* Annual Cost Summary Card */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 backdrop-blur-xl rounded-2xl border border-indigo-500/30 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-300 text-sm font-medium mb-1">Costo Anual de Suscripciones</p>
            <p className="text-3xl lg:text-4xl font-bold text-white">${formatMoney(annualCost)}</p>
            <p className="text-slate-400 text-xs mt-1">Basado en {subscriptions.length} suscripción(es) activa(s)</p>
          </div>
          <div className="bg-indigo-500/20 p-4 rounded-xl">
            <CreditCard className="w-8 h-8 text-indigo-400" />
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">
                {editingSubscription ? 'Editar Suscripción' : 'Nueva Suscripción'}
              </h2>
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(form); }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Nombre</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Monto</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Frecuencia</label>
                    <select
                      value={form.frequency}
                      onChange={(e) => setForm({ ...form, frequency: e.target.value as SubscriptionFrequency })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensual</option>
                      <option value="quarterly">Trimestral</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Próxima Fecha de Cobro</label>
                    <input
                      type="date"
                      value={form.next_billing_date}
                      onChange={(e) => setForm({ ...form, next_billing_date: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Cuenta</label>
                    <select
                      value={form.account_id}
                      onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Sin cuenta</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Categoría</label>
                    <select
                      value={form.category_id}
                      onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Sin categoría</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
                    />
                    <label htmlFor="is_active" className="ml-2 text-sm text-slate-300">Activa</label>
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingSubscription(null);
                      setForm(emptyForm);
                    }}
                    className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions Grid */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50">
        {subscriptions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">No hay suscripciones aún</p>
            <p className="text-slate-500 text-sm mt-2">Agrega tu primera suscripción para comenzar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="bg-slate-700/50 rounded-xl p-5 border border-slate-600/50 hover:border-purple-500/50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">{subscription.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(subscription)} className="text-blue-400 hover:text-blue-300">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(subscription.id)} className="text-red-400 hover:text-red-300">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-2xl font-bold text-white mb-2">${formatMoney(subscription.amount)}</p>
                <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
                  <Calendar className="w-4 h-4" />
                  <span>{getFrequencyLabel(subscription.frequency)}</span>
                </div>
                {subscription.next_billing_date && (
                  <p className="text-xs text-slate-500 mb-3">
                    Próximo cobro: {new Date(subscription.next_billing_date).toLocaleDateString('es-ES')}
                  </p>
                )}
                {subscription.category_id && (
                  <div className="mt-3 pt-3 border-t border-slate-600/50">
                    <span className="text-xs text-slate-400">
                      {categories.find(c => c.id === subscription.category_id)?.name || 'Sin categoría'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Eliminar Suscripción"
        message="¿Estás seguro de que quieres eliminar esta suscripción? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Subscriptions;

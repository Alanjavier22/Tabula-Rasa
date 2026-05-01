import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js-light';
import { accountsAPI, statementsAPI } from '../services/api';
import type { Account, CreditCardStatement } from '../types';
import { formatMoney, toDecimal, toCents, clampZero } from '../utils/money';
import { Plus, Trash2, Edit, Wallet, CreditCard, PiggyBank, TrendingUp, DollarSign, ChevronDown, ChevronUp, User, Clock, CheckCircle2, Link, X } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  name: '',
  account_type: 'checking',
  balance: '',
  currency: 'USD',
  bank_name: '',
  description: '',
  is_active: true,
};

const Accounts = () => {
  const queryClient = useQueryClient();
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });

  // --- React Query: Data Fetching ---
  const { data: accounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => accountsAPI.getAll().then(res => res.data ?? []),
  });

  const { data: statements = [], isLoading: statementsLoading } = useQuery<CreditCardStatement[]>({
    queryKey: ['statements'],
    queryFn: () => statementsAPI.getAll().then(res => res.data ?? []),
  });

  const isLoading = accountsLoading || statementsLoading;

  // --- React Query: Mutations (invalidan queries en onSuccess para refrescar UI) ---
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['statements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => accountsAPI.create(payload),
    onSuccess: () => {
      invalidateAll();
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Cuenta creada', type: 'success' });
    },
    onError: (error: any) => {
      console.error('Error creating account:', error);
      setToast({ message: error.response?.data?.detail || 'Error al crear cuenta', type: 'error' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => accountsAPI.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setShowEditModal(false);
      setEditingAccount(null);
      setEditForm(emptyForm);
      setToast({ message: 'Cuenta actualizada', type: 'success' });
    },
    onError: (error: any) => {
      console.error('Error updating account:', error);
      setToast({ message: error.response?.data?.detail || 'Error al actualizar cuenta', type: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsAPI.delete(id),
    onSuccess: () => {
      invalidateAll();
      setToast({ message: 'Cuenta eliminada', type: 'success' });
    },
    onError: (error: any) => {
      console.error('Error deleting account:', error);
      setToast({ message: error.response?.data?.detail || 'Error al eliminar cuenta', type: 'error' });
    },
    onSettled: () => {
      setDeleteConfirm({ isOpen: false, id: null });
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const getStatementForAccount = (accountId: string) => {
    return statements.find(s => s.account_id === accountId);
  };

  const getLinkedAccountName = (linkedId?: string) => {
    if (!linkedId) return null;
    const linked = accounts.find(a => a.id === linkedId);
    return linked?.name || null;
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = () => {
    if (deleteConfirm.id === null) return;
    deleteMutation.mutate(deleteConfirm.id);
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setEditForm({
      name: account.name,
      account_type: account.account_type,
      // Backend returns cents, divide by 100 for display in form
      balance: toDecimal(account.balance).dividedBy(100).toString(),
      currency: account.currency,
      bank_name: account.bank_name || '',
      description: account.description || '',
      is_active: account.is_active,
    });
    setShowEditModal(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Convert user input (dollars) to cents for backend
    createMutation.mutate({
      name: form.name,
      account_type: form.account_type,
      balance: toCents(form.balance || 0),
      currency: form.currency,
      bank_name: form.bank_name || null,
      description: form.description || null,
      is_active: form.is_active,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    // Convert user input (dollars) to cents for backend
    updateMutation.mutate({
      id: editingAccount.id,
      payload: {
        name: editForm.name,
        account_type: editForm.account_type,
        balance: toCents(editForm.balance || 0),
        currency: editForm.currency,
        bank_name: editForm.bank_name || null,
        description: editForm.description || null,
        is_active: editForm.is_active,
      },
    });
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'checking':
        return <Wallet className="w-5 h-5" />;
      case 'savings':
        return <PiggyBank className="w-5 h-5" />;
      case 'credit_card':
        return <CreditCard className="w-5 h-5" />;
      case 'investment':
        return <TrendingUp className="w-5 h-5" />;
      case 'cash':
        return <DollarSign className="w-5 h-5" />;
      default:
        return <Wallet className="w-5 h-5" />;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-white">Cargando...</div>;
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 lg:mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Cuentas</h1>
          <p className="text-slate-300 text-sm lg:text-base">Gestiona tus cuentas bancarias y billeteras</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 lg:px-6 py-2 lg:py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-300 text-sm lg:text-base whitespace-nowrap">
          <Plus className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
          Agregar Cuenta
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-slate-400 text-lg">No hay cuentas aún</p>
            <p className="text-slate-500 text-sm mt-2">Agrega tu primera cuenta para trackear tus finanzas</p>
          </div>
        ) : (
          accounts.map((account) => {
            const stmt = account.account_type === 'credit_card' ? getStatementForAccount(account.id) : null;
            const isExpanded = expandedCard === account.id;

            return (
              <div
                key={account.id}
                className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 hover:border-purple-500/50 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className="bg-blue-500/20 p-3 rounded-full mr-3">
                      {getAccountIcon(account.account_type)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{account.name}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm text-slate-300 capitalize">{account.account_type.replace('_', ' ')}</p>
                        {account.bank_name && (
                          <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">
                            {account.bank_name}
                          </span>
                        )}
                      </div>
                      {account.linked_account_id && (
                        <div className="flex items-center gap-1 mt-1">
                          <Link className="w-3 h-3 text-purple-400" />
                          <span className="text-xs text-purple-400">
                            Vinculada a {getLinkedAccountName(account.linked_account_id)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => handleEdit(account)} className="text-blue-400 hover:text-blue-300">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <p className="text-sm text-slate-400">Saldo Total</p>
                  <p className={`text-2xl font-bold ${toDecimal(account.balance).lt(0) ? 'text-red-400' : 'text-white'}`}>
                    ${formatMoney(account.balance)}
                  </p>
                </div>

                {/* Credit Card Statement Section */}
                {stmt && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    <button
                      onClick={() => setExpandedCard(isExpanded ? null : account.id)}
                      className="flex items-center justify-between w-full text-left mb-2"
                    >
                      <span className="text-sm font-medium text-purple-400">
                        Estado de Cuenta ({stmt.month}/{stmt.year})
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>

                    {/* Summary always visible */}
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                      <div>
                        <p className="text-slate-500 text-xs">Corte</p>
                        <p className="text-white font-semibold">${formatMoney(stmt.statement_balance)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Tu parte</p>
                        <p className="text-orange-400 font-semibold">${formatMoney(stmt.user_share)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Pagado</p>
                        <p className="text-green-400 font-semibold">${formatMoney(stmt.amount_paid)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Pendiente tuyo</p>
                        <p className={`font-semibold ${toDecimal(stmt.user_share).minus(toDecimal(stmt.amount_paid)).lte(0) ? 'text-green-400' : 'text-red-400'}`}>
                          ${formatMoney(clampZero(toDecimal(stmt.user_share).minus(toDecimal(stmt.amount_paid))))}
                        </p>
                      </div>
                    </div>

                    {/* Expanded: debt shares */}
                    {isExpanded && (stmt.debt_shares ?? []).length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium text-slate-400 uppercase">Deudas de terceros</p>
                        {(stmt.debt_shares ?? []).map((share) => (
                          <div key={share.id} className="flex items-center justify-between bg-slate-700/30 rounded-lg px-3 py-2">
                            <div className="flex items-center">
                              <User className="w-3 h-3 text-slate-400 mr-2" />
                              <div>
                                <p className="text-sm text-white">{share.person_name}</p>
                                {share.description && <p className="text-xs text-slate-500">{share.description}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-yellow-400">${formatMoney(share.amount)}</span>
                              {share.status === 'pending' ? (
                                <Clock className="w-3 h-3 text-yellow-400" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3 text-green-400" />
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between text-xs text-slate-400 pt-1">
                          <span>Total terceros:</span>
                          <span className="text-yellow-400 font-semibold">
                            ${formatMoney((stmt.debt_shares ?? []).reduce((sum: Decimal, s: any) => sum.plus(toDecimal(s.amount)), new Decimal(0)))}
                          </span>
                        </div>
                      </div>
                    )}

                    {isExpanded && stmt.notes && (
                      <p className="text-xs text-slate-500 mt-2 italic">{stmt.notes}</p>
                    )}

                    {/* Status badge */}
                    <div className="mt-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        stmt.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                        stmt.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {stmt.status === 'paid' ? 'Pagado' : stmt.status === 'partial' ? 'Pago Parcial' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                )}

                {!stmt && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{account.currency}</span>
                      {account.is_active ? (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
                          Activa
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-slate-700 text-slate-400 rounded-full text-xs">
                          Inactiva
                        </span>
                      )}
                    </div>
                    {account.description && (
                      <p className="text-sm text-slate-400 mt-3">{account.description}</p>
                    )}
                  </>
                )}
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
              <h2 className="text-xl font-bold text-white">Nueva Cuenta</h2>
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
                  placeholder="Ej: Banco XYZ"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Tipo *</label>
                  <select
                    value={form.account_type}
                    onChange={e => setForm({...form, account_type: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="checking">Cuenta Corriente</option>
                    <option value="savings">Ahorros</option>
                    <option value="credit_card">Tarjeta Crédito</option>
                    <option value="investment">Inversión</option>
                    <option value="cash">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Saldo Inicial *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={form.balance}
                    onChange={e => setForm({...form, balance: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Moneda</label>
                  <select
                    value={form.currency}
                    onChange={e => setForm({...form, currency: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                    <option value="COP">COP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Banco</label>
                  <input
                    type="text"
                    value={form.bank_name}
                    onChange={e => setForm({...form, bank_name: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  rows={2}
                  placeholder="Opcional"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.is_active}
                  onChange={e => setForm({...form, is_active: e.target.checked})}
                  className="rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="isActive" className="text-sm text-slate-300">Cuenta activa</label>
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
      {showEditModal && editingAccount && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h2 className="text-xl font-bold text-white">Editar Cuenta</h2>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Tipo *</label>
                  <select
                    value={editForm.account_type}
                    onChange={e => setEditForm({...editForm, account_type: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="checking">Cuenta Corriente</option>
                    <option value="savings">Ahorros</option>
                    <option value="credit_card">Tarjeta Crédito</option>
                    <option value="investment">Inversión</option>
                    <option value="cash">Efectivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Saldo *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editForm.balance}
                    onChange={e => setEditForm({...editForm, balance: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Moneda</label>
                  <select
                    value={editForm.currency}
                    onChange={e => setEditForm({...editForm, currency: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                    <option value="COP">COP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Banco</label>
                  <input
                    type="text"
                    value={editForm.bank_name}
                    onChange={e => setEditForm({...editForm, bank_name: e.target.value})}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Descripción</label>
                <textarea
                  value={editForm.description}
                  onChange={e => setEditForm({...editForm, description: e.target.value})}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={editForm.is_active}
                  onChange={e => setEditForm({...editForm, is_active: e.target.checked})}
                  className="rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="editIsActive" className="text-sm text-slate-300">Cuenta activa</label>
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
        title="Eliminar Cuenta"
        message="¿Estás seguro de que quieres eliminar esta cuenta? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Accounts;

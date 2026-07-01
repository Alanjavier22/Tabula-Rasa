import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js-light';
import { motion, AnimatePresence } from 'framer-motion';
import { accountsAPI, statementsAPI } from '../services/api';
import type { Account, CreditCardStatement } from '../types';
import { formatMoney, toDecimal, toCents, clampZero } from '../utils/money';
import { Plus, Trash2, Edit, Wallet, CreditCard, PiggyBank, TrendingUp, DollarSign, ChevronDown, ChevronUp, Clock, CheckCircle2, Link, X, Building2, ShieldCheck, RefreshCw, Info, Calendar, Layers, AlignLeft } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import Select from '../components/common/Select';

const emptyForm = {
  name: '',
  account_type: 'checking',
  balance: '',
  currency: 'USD',
  credit_limit: '',
  bank_name: '',
  description: '',
  is_active: true,
  linked_account_id: '',
  statement_day: '',
  payment_day: '',
};

const emptyStatementForm = {
  account_id: '',
  statement_balance: '',
  user_share: '',
  payment_due_date: '',
  cut_off_date: '',
  amount_paid: '0',
  status: 'pending',
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  notes: '',
};



const Accounts = () => {
  const queryClient = useQueryClient();
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [statementForm, setStatementForm] = useState(emptyStatementForm);
  const [editingStatement, setEditingStatement] = useState<CreditCardStatement | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });

  // Bloquear scroll del body cuando el modal está activo
  useEffect(() => {
    if (showCreateModal || showEditModal || showStatementModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showCreateModal, showEditModal, showStatementModal]);

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

  // --- Mutations ---
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['statements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => accountsAPI.create(payload),
    onSuccess: () => {
      invalidateAll();
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Cuenta creada', type: 'success' });
    },
    onError: (error: unknown) => setToast({ message: error.response?.data?.detail || 'Error al crear cuenta', type: 'error' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) => accountsAPI.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setShowEditModal(false);
      setEditingAccount(null);
      setEditForm(emptyForm);
      setToast({ message: 'Cuenta actualizada', type: 'success' });
    },
    onError: (error: unknown) => setToast({ message: error.response?.data?.detail || 'Error al actualizar cuenta', type: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsAPI.delete(id),
    onSuccess: () => {
      invalidateAll();
      setToast({ message: 'Cuenta eliminada', type: 'success' });
    },
    onError: (error: unknown) => setToast({ message: error.response?.data?.detail || 'Error al eliminar cuenta', type: 'error' }),
    onSettled: () => setDeleteConfirm({ isOpen: false, id: null }),
  });

  const createStatementMutation = useMutation({
    mutationFn: (payload: unknown) => statementsAPI.create(payload),
    onSuccess: () => {
      invalidateAll();
      setShowStatementModal(false);
      setStatementForm(emptyStatementForm);
      setEditingStatement(null);
      setToast({ message: 'Estado de cuenta creado', type: 'success' });
    },
    onError: (error: unknown) => setToast({ message: error.response?.data?.detail || 'Error al crear estado de cuenta', type: 'error' }),
  });

  const updateStatementMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) => statementsAPI.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setShowStatementModal(false);
      setStatementForm(emptyStatementForm);
      setEditingStatement(null);
      setToast({ message: 'Estado de cuenta actualizado', type: 'success' });
    },
    onError: (error: unknown) => setToast({ message: error.response?.data?.detail || 'Error al actualizar estado de cuenta', type: 'error' }),
  });

  const deleteStatementMutation = useMutation({
    mutationFn: (id: string) => statementsAPI.delete(id),
    onSuccess: () => invalidateAll(),
    onError: (error: unknown) => setToast({ message: error.response?.data?.detail || 'Error al eliminar estado de cuenta', type: 'error' }),
  });

  const saving = createMutation.isPending || updateMutation.isPending || createStatementMutation.isPending || updateStatementMutation.isPending;

  const getStatementForAccount = (accountId: string) => statements.find(s => s.account_id === accountId);

  const handleCreateStatement = (accountId: string) => {
    setStatementForm({ ...emptyStatementForm, account_id: accountId });
    setEditingStatement(null);
    setShowStatementModal(true);
  };

  const handleEditStatement = (stmt: CreditCardStatement) => {
    setEditingStatement(stmt);
    setStatementForm({
      account_id: stmt.account_id,
      statement_balance: toDecimal(stmt.statement_balance).dividedBy(100).toString(),
      user_share: toDecimal(stmt.user_share).dividedBy(100).toString(),
      payment_due_date: stmt.payment_due_date ? stmt.payment_due_date.substring(0, 10) : '',
      cut_off_date: stmt.cut_off_date ? stmt.cut_off_date.substring(0, 10) : '',
      amount_paid: toDecimal(stmt.amount_paid).dividedBy(100).toString(),
      status: stmt.status,
      month: stmt.month,
      year: stmt.year,
      notes: stmt.notes || '',
    });
    setShowStatementModal(true);
  };

  const handleDeleteStatement = (stmtId: string) => {
    if (confirm('¿Estás seguro de eliminar este estado de cuenta?')) {
      deleteStatementMutation.mutate(stmtId);
    }
  };

  const handleStatementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      account_id: statementForm.account_id,
      statement_balance: toCents(statementForm.statement_balance || 0),
      user_share: toCents(statementForm.user_share || 0),
      payment_due_date: statementForm.payment_due_date ? statementForm.payment_due_date + 'T00:00:00' : null,
      cut_off_date: statementForm.cut_off_date ? statementForm.cut_off_date + 'T00:00:00' : null,
      amount_paid: toCents(statementForm.amount_paid || 0),
      status: statementForm.status,
      month: parseInt(statementForm.month.toString()),
      year: parseInt(statementForm.year.toString()),
      notes: statementForm.notes || null,
    };
    if (editingStatement) updateStatementMutation.mutate({ id: editingStatement.id, payload });
    else createStatementMutation.mutate(payload);
  };



  const handleDelete = (id: string) => setDeleteConfirm({ isOpen: true, id });
  const confirmDelete = () => deleteConfirm.id && deleteMutation.mutate(deleteConfirm.id);

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setEditForm({
      name: account.name,
      account_type: account.account_type,
      balance: toDecimal(account.balance).dividedBy(100).toString(),
      currency: account.currency || 'USD',
      credit_limit: account.credit_limit ? toDecimal(account.credit_limit).dividedBy(100).toString() : '',
      bank_name: account.bank_name || '',
      description: account.description || '',
      is_active: account.is_active,
      linked_account_id: account.linked_account_id || '',
      statement_day: account.statement_day?.toString() || '',
      payment_day: account.payment_day?.toString() || '',
    });
    setShowEditModal(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...form,
      balance: toCents(form.balance || 0),
      credit_limit: form.credit_limit ? toCents(form.credit_limit) : null,
      statement_day: form.statement_day ? parseInt(form.statement_day) : null,
      payment_day: form.payment_day ? parseInt(form.payment_day) : null,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    updateMutation.mutate({
      id: editingAccount.id,
      payload: {
        ...editForm,
        balance: toCents(editForm.balance || 0),
        credit_limit: editForm.credit_limit ? toCents(editForm.credit_limit) : null,
        statement_day: editForm.statement_day ? parseInt(editForm.statement_day) : null,
        payment_day: editForm.payment_day ? parseInt(editForm.payment_day) : null,
      },
    });
  };

  const getAccountStyle = (type: string) => {
    switch (type) {
      case 'checking': return 'from-blue-600/20 to-indigo-600/20 border-blue-500/30 text-blue-400';
      case 'savings': return 'from-emerald-600/20 to-teal-600/20 border-emerald-500/30 text-emerald-400';
      case 'credit_card': return 'from-purple-600/20 to-rose-600/20 border-purple-500/30 text-purple-400';
      case 'investment': return 'from-amber-600/20 to-orange-600/20 border-amber-500/30 text-amber-400';
      default: return 'from-slate-600/20 to-slate-800/20 border-slate-500/30 text-slate-400';
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'checking': return <Wallet className="w-6 h-6" />;
      case 'savings': return <PiggyBank className="w-6 h-6" />;
      case 'credit_card': return <CreditCard className="w-6 h-6" />;
      case 'investment': return <TrendingUp className="w-6 h-6" />;
      default: return <DollarSign className="w-6 h-6" />;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-white font-medium">Sincronizando cuentas...</div>;
  }

  return (
    <div className="w-full relative min-h-screen pb-20">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold tracking-widest uppercase mb-1">
              <div className="w-8 h-[1px] bg-indigo-500/50"></div>
              <span>Tabula Rasa</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
              Bóveda de <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">Cuentas</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium">Control total sobre tus fuentes de capital</p>
          </motion.div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-6 py-3.5 rounded-2xl hover:shadow-lg hover:shadow-indigo-500/20 transition-all font-bold group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            <span>Nueva Cuenta</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {accounts.length === 0 ? (
              <div className="col-span-full text-center py-20 bg-slate-800/20 rounded-3xl border-2 border-dashed border-slate-700/30">
                <p className="text-slate-400 text-lg font-medium">No hay fuentes registradas</p>
                <button onClick={() => setShowCreateModal(true)} className="text-indigo-400 text-sm font-bold mt-2 hover:underline">
                  Registra tu primera cuenta aquí
                </button>
              </div>
            ) : (
              accounts.map((account, index) => {
                const stmt = account.account_type === 'credit_card' ? getStatementForAccount(account.id) : null;
                const isExpanded = expandedCard === account.id;
                const style = getAccountStyle(account.account_type);

                return (
                  <motion.div
                    key={account.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`bg-gradient-to-br ${style} backdrop-blur-xl border rounded-[2rem] p-6 shadow-xl relative overflow-hidden group`}
                  >
                    {/* Decorative Card Elements */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/10 transition-all"></div>
                    
                    <div className="flex justify-between items-start mb-6 relative">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900/40 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-inner">
                          {getAccountIcon(account.account_type)}
                        </div>
                        <div>
                          <h3 className="text-xl font-black text-white tracking-tight leading-none mb-1">{account.name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{account.bank_name || 'Privado'}</span>
                            {account.linked_account_id && (
                              <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-bold uppercase">
                                <Link className="w-2.5 h-2.5" />
                                <span>Vinculada</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(account)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(account.id)} className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-white/60 hover:text-rose-400 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mb-8 relative">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-black text-4xl tracking-tighter">
                          ${(() => {
                            const bal = toDecimal(account.balance).abs();
                            const stmtBal = stmt ? toDecimal(stmt.statement_balance) : new Decimal(0);
                            const displayBal = (account.account_type === 'credit_card' && bal.lt(stmtBal)) ? stmtBal : bal;
                            return formatMoney(account.account_type === 'credit_card' ? displayBal : account.balance);
                          })()}
                        </span>
                      </div>
                      <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em]">
                        {account.account_type === 'credit_card' ? 'Utilizado (Deuda Total)' : 'Saldo Disponible'}
                      </p>

                      {/* Global Debt Breakdown for Credit Cards */}
                      {account.account_type === 'credit_card' && (() => {
                        const accountStatements = statements.filter(s => s.account_id === account.id);
                        const totalOthersDebtCents = accountStatements.reduce((acc, s) => {
                          const statementOthers = toDecimal(s.statement_balance).minus(toDecimal(s.user_share));
                          return acc.plus(statementOthers);
                        }, new Decimal(0));
                        
                        // Treat balance as debt magnitude for credit cards
                        const bal = toDecimal(account.balance).abs();
                        const stmtBal = stmt ? toDecimal(stmt.statement_balance) : new Decimal(0);
                        const bankDebtCents = bal.gt(stmtBal) ? bal : stmtBal;
                          
                        const totalUserDebtCents = clampZero(bankDebtCents.minus(totalOthersDebtCents));

                        return (
                          <div className="mt-4 flex gap-6 p-4 bg-black/20 rounded-2xl border border-white/5 shadow-inner">
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">Tu Deuda Real</span>
                              <span className="text-sm font-black text-indigo-400 tracking-tight">${formatMoney(totalUserDebtCents)}</span>
                            </div>
                            <div className="w-[1px] bg-white/5 self-stretch"></div>
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-1">De Otros</span>
                              <span className="text-sm font-black text-yellow-500/80 tracking-tight">${formatMoney(totalOthersDebtCents)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {account.account_type === 'credit_card' && (
                      <div className="mt-6 pt-6 border-t border-white/5 relative">
                        {stmt ? (
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <button 
                                onClick={() => setExpandedCard(isExpanded ? null : account.id)}
                                className="flex items-center gap-2 text-xs font-black text-white/60 hover:text-white transition-colors"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                ESTADO DE CUENTA
                              </button>
                              <div className="flex gap-2">
                                <button onClick={() => handleEditStatement(stmt)} className="text-white/40 hover:text-blue-400 transition-colors"><Edit className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDeleteStatement(stmt.id)} className="text-white/40 hover:text-rose-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>

                            <div className="bg-black/20 rounded-[1.5rem] p-5 border border-white/5 space-y-4">
                              {/* Calculation Header */}
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-black text-white/30 uppercase tracking-widest">
                                  <span>Consumo Total (Banco)</span>
                                  <span className="text-white/80 font-black">${formatMoney(stmt.statement_balance)}</span>
                                </div>
                                
                                {(stmt.debt_shares ?? []).length > 0 && (
                                  <div className="flex justify-between items-center text-[10px] font-black text-rose-400/60 uppercase tracking-widest">
                                    <span>(-) Consumo de Otros</span>
                                    <span className="font-black">-${formatMoney(toDecimal(stmt.statement_balance).minus(toDecimal(stmt.user_share)))}</span>
                                  </div>
                                )}

                                <div className="h-[1px] bg-white/5 my-2"></div>

                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black text-indigo-400/60 uppercase tracking-widest">Tu Gasto Real</span>
                                  <span className="text-2xl font-black text-indigo-400 tracking-tighter">${formatMoney(stmt.user_share)}</span>
                                </div>
                              </div>

                              {/* Progress Bar & Status */}
                              <div className="pt-2 space-y-3">
                                <div className="bg-black/40 h-2 rounded-full overflow-hidden p-[1px] border border-white/5">
                                  <div 
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(52,211,153,0.2)]"
                                    style={{ width: `${Math.min(100, (parseFloat(toDecimal(stmt.amount_paid).toString()) / parseFloat(toDecimal(stmt.statement_balance).toString())) * 100)}%` }}
                                  ></div>
                                </div>
                                
                                <div className="flex justify-between items-end">
                                  <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Abonado</span>
                                    <span className="text-xs font-bold text-white/60">${formatMoney(stmt.amount_paid)}</span>
                                  </div>
                                  <div className="flex flex-col text-right">
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Falta por Pagar</span>
                                    <span className={`text-sm font-black tracking-tight ${toDecimal(stmt.statement_balance).minus(toDecimal(stmt.amount_paid)).lte(0) ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      ${formatMoney(clampZero(toDecimal(stmt.statement_balance).minus(toDecimal(stmt.amount_paid))))}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <AnimatePresence>
                              {isExpanded && (stmt.debt_shares ?? []).length > 0 && (
                                <motion.div 
                                  initial={{ opacity: 0, height: 0 }} 
                                  animate={{ opacity: 1, height: 'auto' }} 
                                  exit={{ opacity: 0, height: 0 }} 
                                  className="overflow-hidden space-y-2 pt-2"
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="h-[1px] flex-1 bg-white/5"></div>
                                    <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Pendientes de Cobro</span>
                                    <div className="h-[1px] flex-1 bg-white/5"></div>
                                  </div>
                                  {(stmt.debt_shares ?? []).map((share) => (
                                    <div key={share.id} className="flex items-center justify-between bg-black/20 rounded-2xl px-4 py-3 border border-white/5 group/share">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-xs font-black text-white/40 border border-white/5 group-hover/share:border-indigo-500/30 transition-all">
                                          {share.person_name.charAt(0)}
                                        </div>
                                        <span className="text-sm font-bold text-white/80 group-hover/share:text-white transition-colors">{share.person_name}</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-sm font-black text-yellow-400">${formatMoney(share.amount)}</span>
                                        {share.status === 'paid' ? (
                                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                        ) : (
                                          <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleCreateStatement(account.id)}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white/60 hover:text-white text-xs font-black uppercase tracking-widest transition-all"
                          >
                            <Plus className="w-4 h-4" />
                            Agregar Estado de Cuenta
                          </button>
                        )}
                      </div>
                    )}

                    {!stmt && account.account_type !== 'credit_card' && (
                      <div className="mt-6 pt-6 border-t border-white/5 relative flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${account.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></div>
                          <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{account.is_active ? 'Activa' : 'Inactiva'}</span>
                        </div>
                        {account.credit_limit && (
                          <div className="text-right">
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Límite</p>
                            <p className="text-xs font-bold text-white/60">${formatMoney(account.credit_limit)}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            >
              {/* Header */}
              <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-white/5 shrink-0">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-indigo-500/5 to-emerald-500/5 pointer-events-none"></div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                    <Wallet className="w-5 h-5 text-indigo-400" />
                  </div>
                  Nueva Cuenta
                </h2>
                <button onClick={() => setShowCreateModal(false)} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">
                
                {/* VISTA PREVIA DE TARJETA VIRTUAL */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                    Vista Previa de Cuenta
                  </label>
                  <div className="bg-black/20 rounded-3xl p-4 border border-white/5">
                    <div className={`aspect-[1.6/1] w-full rounded-2xl bg-gradient-to-br ${getAccountStyle(form.account_type)} p-6 border border-white/10 relative overflow-hidden flex flex-col justify-between shadow-2xl`}>
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center border border-white/10">
                          {getAccountIcon(form.account_type)}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Banco</span>
                          <span className="text-xs font-bold text-white/80">{form.bank_name || 'Nombre del Banco'}</span>
                        </div>
                      </div>
                      
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/30 block mb-1">Saldo Estimado</span>
                        <span className="text-3xl font-black text-white tracking-tighter">${form.balance || '0.00'}</span>
                      </div>

                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-white/60 tracking-tight">{form.name || 'Titular de la Cuenta'}</span>
                        <div className="px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                          <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter">
                            {form.account_type.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Nombre y Tipo */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        <Building2 className="w-3 h-3" />
                        Alias de la Cuenta
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                        placeholder="Ej: Ahorros Principal"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        <PiggyBank className="w-3 h-3" />
                        Tipo de Recurso
                      </label>
                      <Select
                        value={form.account_type}
                        onChange={(value) => setForm({...form, account_type: value})}
                        options={[
                          { value: 'checking', label: 'Cuenta Corriente' },
                          { value: 'savings', label: 'Ahorros' },
                          { value: 'credit_card', label: 'Tarjeta Crédito' },
                          { value: 'investment', label: 'Inversión' },
                          { value: 'cash', label: 'Efectivo' }
                        ]}
                      />
                    </div>
                  </div>

                  {/* Saldo y Banco */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        <DollarSign className="w-3 h-3" />
                        Saldo Inicial
                      </label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          required
                          value={form.balance}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.,]/g, '');
                            setForm({...form, balance: val});
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        <Building2 className="w-3 h-3" />
                        Entidad Financiera
                      </label>
                      <input
                        type="text"
                        value={form.bank_name}
                        onChange={e => setForm({...form, bank_name: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-medium"
                        placeholder="Ej: Banco Pichincha"
                      />
                    </div>
                  </div>

                  {/* Vinculación */}
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <Link className="w-3 h-3" />
                      Cuenta Vinculada
                    </label>
                    <Select
                      value={form.linked_account_id}
                      onChange={(value) => setForm({...form, linked_account_id: value})}
                      options={[
                        { value: '', label: '-- Sin vincular --' },
                        ...accounts.map(acc => ({ value: acc.id, label: `${acc.name} (${acc.account_type.replace('_', ' ')})` }))
                      ]}
                    />
                    <div className="flex gap-2 mt-3 ml-1">
                      <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Útil para asociar tarjetas de crédito con su cuenta de pago</p>
                    </div>
                  </div>

                  {/* Credit Card Specifics */}
                  {form.account_type === 'credit_card' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-6 pt-4 border-t border-white/5"
                    >
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                            Día de Corte
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={form.statement_day}
                            onChange={e => setForm({...form, statement_day: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                            placeholder="1-31"
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                            Límite de Pago
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={form.payment_day}
                            onChange={e => setForm({...form, payment_day: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                            placeholder="1-31"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                          Cupo de Crédito Otorgado
                        </label>
                        <div className="relative">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={form.credit_limit}
                            onChange={e => {
                              const val = e.target.value.replace(/[^0-9.,]/g, '');
                              setForm({...form, credit_limit: val});
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                            placeholder="5000.00"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex items-center gap-4 bg-white/5 p-5 rounded-[2rem] border border-white/10 group cursor-pointer" onClick={() => setForm({...form, is_active: !form.is_active})}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${form.is_active ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent border-white/20'}`}>
                      {form.is_active && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-black text-white uppercase tracking-widest block leading-none mb-1">Cuenta Operativa</span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Si está desactivada, no se sumará al patrimonio total</span>
                    </div>
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="p-7 border-t border-white/5 bg-slate-900/50 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  onClick={handleCreateSubmit}
                  disabled={saving}
                  className="flex-[2] py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white transition-all text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-900/20 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {saving ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Guardando...
                    </div>
                  ) : (
                    'Confirmar Apertura'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {showEditModal && editingAccount && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            >
              {/* Header */}
              <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-white/5 shrink-0">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-blue-500/5 to-purple-500/5 pointer-events-none"></div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <Edit className="w-5 h-5 text-blue-400" />
                  </div>
                  Editar Cuenta
                </h2>
                <button onClick={() => setShowEditModal(false)} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">
                
                {/* VISTA PREVIA DE TARJETA VIRTUAL */}
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                    Vista Previa de Cuenta
                  </label>
                  <div className="bg-black/20 rounded-3xl p-4 border border-white/5">
                    <div className={`aspect-[1.6/1] w-full rounded-2xl bg-gradient-to-br ${getAccountStyle(editForm.account_type)} p-6 border border-white/10 relative overflow-hidden flex flex-col justify-between shadow-2xl`}>
                      <div className="flex justify-between items-start">
                        <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center border border-white/10">
                          {getAccountIcon(editForm.account_type)}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white/40 block">Banco</span>
                          <span className="text-xs font-bold text-white/80">{editForm.bank_name || 'Nombre del Banco'}</span>
                        </div>
                      </div>
                      
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/30 block mb-1">Saldo Actual</span>
                        <span className="text-3xl font-black text-white tracking-tighter">${editForm.balance || '0.00'}</span>
                      </div>

                      <div className="flex justify-between items-end">
                        <span className="text-xs font-bold text-white/60 tracking-tight">{editForm.name || 'Titular de la Cuenta'}</span>
                        <div className="px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                          <span className="text-[8px] font-black text-white/40 uppercase tracking-tighter">
                            {editForm.account_type.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Nombre y Tipo */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        <Building2 className="w-3 h-3" />
                        Alias de la Cuenta
                      </label>
                      <input
                        type="text"
                        required
                        value={editForm.name}
                        onChange={e => setEditForm({...editForm, name: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        <PiggyBank className="w-3 h-3" />
                        Tipo de Recurso
                      </label>
                      <Select
                        value={editForm.account_type}
                        onChange={(value) => setEditForm({...editForm, account_type: value})}
                        options={[
                          { value: 'checking', label: 'Cuenta Corriente' },
                          { value: 'savings', label: 'Ahorros' },
                          { value: 'credit_card', label: 'Tarjeta Crédito' },
                          { value: 'investment', label: 'Inversión' },
                          { value: 'cash', label: 'Efectivo' }
                        ]}
                      />
                    </div>
                  </div>

                  {/* Saldo y Banco */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        <DollarSign className="w-3 h-3" />
                        Saldo Actual
                      </label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          required
                          value={editForm.balance}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.,]/g, '');
                            setEditForm({...editForm, balance: val});
                          }}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all font-bold"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                        <Building2 className="w-3 h-3" />
                        Entidad Financiera
                      </label>
                      <input
                        type="text"
                        value={editForm.bank_name}
                        onChange={e => setEditForm({...editForm, bank_name: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                      />
                    </div>
                  </div>

                  {/* Vinculación */}
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <Link className="w-3 h-3" />
                      Cuenta Vinculada
                    </label>
                    <Select
                      value={editForm.linked_account_id}
                      onChange={(value) => setEditForm({...editForm, linked_account_id: value})}
                      options={[
                        { value: '', label: '-- Sin vincular --' },
                        ...accounts.filter(a => a.id !== editingAccount?.id).map(acc => ({ value: acc.id, label: `${acc.name} (${acc.account_type.replace('_', ' ')})` }))
                      ]}
                    />
                  </div>

                  {/* Credit Card Specifics */}
                  {editForm.account_type === 'credit_card' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-6 pt-4 border-t border-white/5"
                    >
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                            Día de Corte
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={editForm.statement_day}
                            onChange={e => setEditForm({...editForm, statement_day: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                            Límite de Pago
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={editForm.payment_day}
                            onChange={e => setEditForm({...editForm, payment_day: e.target.value})}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                          Cupo de Crédito Otorgado
                        </label>
                        <div className="relative">
                          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editForm.credit_limit}
                            onChange={e => {
                              const val = e.target.value.replace(/[^0-9.,]/g, '');
                              setEditForm({...editForm, credit_limit: val});
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all font-bold"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="flex items-center gap-4 bg-white/5 p-5 rounded-[2rem] border border-white/10 group cursor-pointer" onClick={() => setEditForm({...editForm, is_active: !editForm.is_active})}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${editForm.is_active ? 'bg-blue-500 border-blue-500' : 'bg-transparent border-white/20'}`}>
                      {editForm.is_active && <CheckCircle2 className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-black text-white uppercase tracking-widest block leading-none mb-1">Cuenta Operativa</span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Si está desactivada, no se sumará al patrimonio total</span>
                    </div>
                  </div>
                </div>
              </form>

              {/* Footer */}
              <div className="p-7 border-t border-white/5 bg-slate-900/50 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  onClick={handleEditSubmit}
                  disabled={saving}
                  className="flex-[2] py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white transition-all text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {saving ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Guardando...
                    </div>
                  ) : (
                    'Actualizar Datos'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Statement Modal */}
      <AnimatePresence>
        {showStatementModal && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900/90 border border-white/10 rounded-[2.5rem] w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            >
              {/* Header */}
              <div className="relative flex items-center justify-between p-6 md:p-7 border-b border-white/5 shrink-0">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-purple-500/5 to-rose-500/5 pointer-events-none"></div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                    <Layers className="w-5 h-5 text-purple-400" />
                  </div>
                  {editingStatement ? 'Editar Estado' : 'Nuevo Estado'}
                </h2>
                <button onClick={() => setShowStatementModal(false)} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleStatementSubmit} className="flex-1 overflow-y-auto p-6 md:p-7 space-y-8 custom-scrollbar overscroll-contain">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <DollarSign className="w-3 h-3" />
                      Saldo al Corte
                    </label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        value={statementForm.statement_balance}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9.,]/g, '');
                          setStatementForm({...statementForm, statement_balance: val});
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-all font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <ShieldCheck className="w-3 h-3" />
                      Tu Parte (Gasto Real)
                    </label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        value={statementForm.user_share}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9.,]/g, '');
                          setStatementForm({...statementForm, user_share: val});
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Monto ya Abonado
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={statementForm.amount_paid}
                      onChange={e => {
                        const val = e.target.value.replace(/[^0-9.,]/g, '');
                        setStatementForm({...statementForm, amount_paid: val});
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-5 py-4 text-white text-sm focus:outline-none focus:border-emerald-500/50 transition-all font-bold"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      <Calendar className="w-3 h-3" />
                      Periodo (Mes/Año)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        max="12"
                        required
                        value={statementForm.month}
                        onChange={e => setStatementForm({...statementForm, month: parseInt(e.target.value)})}
                        className="w-1/2 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                      />
                      <input
                        type="number"
                        min="2020"
                        max="2030"
                        required
                        value={statementForm.year}
                        onChange={e => setStatementForm({...statementForm, year: parseInt(e.target.value)})}
                        className="w-1/2 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      Estado de Pago
                    </label>
                    <Select
                      value={statementForm.status}
                      onChange={(value) => setStatementForm({...statementForm, status: value})}
                      options={[
                        { value: 'pending', label: 'Pendiente' },
                        { value: 'partial', label: 'Pago Parcial' },
                        { value: 'paid', label: 'Pagado' }
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      Fecha de Corte
                    </label>
                    <input
                      type="date"
                      value={statementForm.cut_off_date}
                      onChange={e => setStatementForm({...statementForm, cut_off_date: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-medium [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                      Límite de Pago
                    </label>
                    <input
                      type="date"
                      value={statementForm.payment_due_date}
                      onChange={e => setStatementForm({...statementForm, payment_due_date: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-medium [color-scheme:dark]"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">
                    <AlignLeft className="w-3 h-3" />
                    Notas Adicionales
                  </label>
                  <textarea
                    value={statementForm.notes}
                    onChange={e => setStatementForm({...statementForm, notes: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-all font-medium resize-none"
                    rows={3}
                    placeholder="Opcional..."
                  />
                </div>
              </form>

              {/* Footer */}
              <div className="p-7 border-t border-white/5 bg-slate-900/50 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowStatementModal(false)}
                  className="flex-1 py-4 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-black uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  onClick={handleStatementSubmit}
                  disabled={saving}
                  className="flex-[2] py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white transition-all text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {saving ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Guardando...
                    </div>
                  ) : (
                    'Registrar Corte'
                  )}
                </button>
              </div>
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
        title="Eliminar Cuenta"
        message="¿Estás seguro de que quieres eliminar esta cuenta? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Accounts;

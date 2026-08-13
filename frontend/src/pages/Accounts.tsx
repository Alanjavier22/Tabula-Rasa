import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js-light';
import { motion, AnimatePresence } from 'framer-motion';
import { accountsAPI, statementsAPI } from '../services/api';
import type { Account, CreditCardStatement, AccountPayload, StatementPayload } from '../types';
import type { AxiosError } from 'axios';
import { formatMoney, toDecimal, toCents, clampZero } from '../utils/money';
import { Plus, Trash2, Edit, ChevronDown, ChevronUp, Clock, CheckCircle2, Link } from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { type AccountFormData, getAccountStyle, getAccountIcon } from '../components/accounts/shared';
import CreateAccountModal from '../components/accounts/CreateAccountModal';
import EditAccountModal from '../components/accounts/EditAccountModal';
import AccountStatementModal, { type StatementFormData } from '../components/accounts/AccountStatementModal';

type ApiError = AxiosError<{ detail?: string }>;

const emptyForm: AccountFormData = {
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

const emptyStatementForm: StatementFormData = {
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
  const { data: accounts = [], isLoading: accountsLoading, isError: accountsError, refetch: refetchAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => accountsAPI.getAll().then(res => res.data ?? []),
  });

  const { data: statements = [], isLoading: statementsLoading, isError: statementsError, refetch: refetchStatements } = useQuery<CreditCardStatement[]>({
    queryKey: ['statements'],
    queryFn: () => statementsAPI.getAll().then(res => res.data ?? []),
  });

  const isLoading = accountsLoading || statementsLoading;
  const isError = accountsError || statementsError;

  // --- Mutations ---
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['statements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: AccountPayload) => accountsAPI.create(payload),
    onSuccess: () => {
      invalidateAll();
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Cuenta creada', type: 'success' });
    },
    onError: (error: ApiError) => setToast({ message: error.response?.data?.detail || 'Error al crear cuenta', type: 'error' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AccountPayload }) => accountsAPI.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setShowEditModal(false);
      setEditingAccount(null);
      setEditForm(emptyForm);
      setToast({ message: 'Cuenta actualizada', type: 'success' });
    },
    onError: (error: ApiError) => setToast({ message: error.response?.data?.detail || 'Error al actualizar cuenta', type: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsAPI.delete(id),
    onSuccess: () => {
      invalidateAll();
      setToast({ message: 'Cuenta eliminada', type: 'success' });
    },
    onError: (error: ApiError) => setToast({ message: error.response?.data?.detail || 'Error al eliminar cuenta', type: 'error' }),
    onSettled: () => setDeleteConfirm({ isOpen: false, id: null }),
  });

  const createStatementMutation = useMutation({
    mutationFn: (payload: StatementPayload) => statementsAPI.create(payload),
    onSuccess: () => {
      invalidateAll();
      setShowStatementModal(false);
      setStatementForm(emptyStatementForm);
      setEditingStatement(null);
      setToast({ message: 'Estado de cuenta creado', type: 'success' });
    },
    onError: (error: ApiError) => setToast({ message: error.response?.data?.detail || 'Error al crear estado de cuenta', type: 'error' }),
  });

  const updateStatementMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatementPayload }) => statementsAPI.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setShowStatementModal(false);
      setStatementForm(emptyStatementForm);
      setEditingStatement(null);
      setToast({ message: 'Estado de cuenta actualizado', type: 'success' });
    },
    onError: (error: ApiError) => setToast({ message: error.response?.data?.detail || 'Error al actualizar estado de cuenta', type: 'error' }),
  });

  const deleteStatementMutation = useMutation({
    mutationFn: (id: string) => statementsAPI.delete(id),
    onSuccess: () => invalidateAll(),
    onError: (error: ApiError) => setToast({ message: error.response?.data?.detail || 'Error al eliminar estado de cuenta', type: 'error' }),
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
      // El Select de tipo de cuenta es un componente genérico (value: string);
      // el cast es seguro porque sus `options` sólo listan valores de AccountType.
      account_type: form.account_type as Account['account_type'],
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
        account_type: editForm.account_type as Account['account_type'],
        balance: toCents(editForm.balance || 0),
        credit_limit: editForm.credit_limit ? toCents(editForm.credit_limit) : null,
        statement_day: editForm.statement_day ? parseInt(editForm.statement_day) : null,
        payment_day: editForm.payment_day ? parseInt(editForm.payment_day) : null,
      },
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-white font-medium">Sincronizando cuentas...</div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <p className="text-white font-medium">No se pudieron cargar las cuentas.</p>
        <button
          onClick={() => { refetchAccounts(); refetchStatements(); }}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
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

      <CreateAccountModal
        isOpen={showCreateModal}
        form={form}
        setForm={setForm}
        accounts={accounts}
        saving={saving}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateSubmit}
      />

      <EditAccountModal
        isOpen={showEditModal}
        editForm={editForm}
        setEditForm={setEditForm}
        editingAccount={editingAccount}
        accounts={accounts}
        saving={saving}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleEditSubmit}
      />

      <AccountStatementModal
        isOpen={showStatementModal}
        statementForm={statementForm}
        setStatementForm={setStatementForm}
        editingStatement={editingStatement}
        saving={saving}
        onClose={() => setShowStatementModal(false)}
        onSubmit={handleStatementSubmit}
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
        title="Eliminar Cuenta"
        message="¿Estás seguro de que quieres eliminar esta cuenta? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Accounts;

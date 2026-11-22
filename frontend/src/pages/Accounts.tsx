import { type CSSProperties, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js-light';
import { motion, AnimatePresence } from 'framer-motion';
import { accountsAPI, statementsAPI } from '../services/api';
import type {
  Account,
  CreditCardStatement,
  AccountPayload,
  StatementPayload,
} from '../types';
import type { AxiosError } from 'axios';
import { formatMoney, toDecimal, toCents, clampZero } from '../utils/money';
import {
  calculateCreditCardDebt,
  calculateLiquidBalance,
  getLatestStatementByAccount,
  isAccountActive,
} from '../utils/accountMetrics';
import {
  Plus,
  Trash2,
  Edit,
  ChevronDown,
  Clock,
  CheckCircle2,
  Link,
  FileText,
  Calendar,
} from 'lucide-react';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  type AccountFormData,
  getAccountAccent,
  getAccountTypeLabel,
  getAccountIcon,
} from '../components/accounts/shared';
import CreateAccountModal from '../components/accounts/CreateAccountModal';
import EditAccountModal from '../components/accounts/EditAccountModal';
import AccountStatementModal, {
  type StatementFormData,
} from '../components/accounts/AccountStatementModal';

type ApiError = AxiosError<{ detail?: string }>;

function statementDateLabel(date?: string | null, day?: number | null) {
  if (date) return date.slice(0, 10);
  if (day) return `Día ${day}`;
  return '—';
}

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

const MONTH_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function StatementDrawer({
  stmt,
  account,
  remainingToPay,
}: Readonly<{
  stmt: CreditCardStatement;
  account: Account;
  remainingToPay: Decimal;
}>) {
  const othersShare = toDecimal(stmt.statement_balance).minus(
    toDecimal(stmt.user_share),
  );
  const debtShares = stmt.debt_shares ?? [];

  return (
    <div className="account-statement-drawer">
      {(stmt.cut_off_date ||
        stmt.payment_due_date ||
        account.statement_day ||
        account.payment_day) && (
        <div className="account-statement-dates">
          <span>
            <Calendar className="w-3 h-3" aria-hidden="true" />
            Corte: {statementDateLabel(stmt.cut_off_date, account.statement_day)}
          </span>
          <span>
            <Clock className="w-3 h-3" aria-hidden="true" />
            Vence: {statementDateLabel(stmt.payment_due_date, account.payment_day)}
          </span>
        </div>
      )}

      <div className="account-statement-rows">
        <div className="account-statement-row">
          <span>Consumo del corte (banco)</span>
          <strong>$ {formatMoney(stmt.statement_balance)}</strong>
        </div>

        {othersShare.gt(0) && (
          <div className="account-statement-row text-danger">
            <span>(−) Consumo de terceros</span>
            <strong>−$ {formatMoney(othersShare)}</strong>
          </div>
        )}

        <div className="account-statement-row is-highlight">
          <span>Tu gasto del corte</span>
          <strong>$ {formatMoney(stmt.user_share)}</strong>
        </div>

        <div className="account-statement-row">
          <span>Abonado a la fecha</span>
          <strong className="text-success">$ {formatMoney(stmt.amount_paid)}</strong>
        </div>

        <div className="account-statement-row">
          <span>Pendiente por pagar</span>
          <strong className={remainingToPay.lte(0) ? 'text-success' : 'text-danger'}>
            $ {formatMoney(remainingToPay)}
          </strong>
        </div>
      </div>

      {debtShares.length > 0 ? (
        <div className="account-shares-list">
          <span className="account-shares-title">Cobros compartidos del corte</span>
          {debtShares.map((share) => (
            <div key={share.id} className="account-share-item">
              <div className="account-share-person">
                <span className="account-share-avatar">
                  {share.person_name.charAt(0)}
                </span>
                <span>{share.person_name}</span>
              </div>
              <div className="account-share-amount">
                <strong>$ {formatMoney(share.amount)}</strong>
                {share.status === 'paid' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" aria-hidden="true" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-warning" aria-hidden="true" />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        stmt.notes && <p className="account-statement-note">{stmt.notes}</p>
      )}
    </div>
  );
}

function AccountStatementSection({
  account,
  stmt,
  isExpanded,
  onToggle,
  onCreateStatement,
  onEditStatement,
  onDeleteStatement,
  remainingToPay,
  paidPct,
}: Readonly<{
  account: Account;
  stmt: CreditCardStatement | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  onCreateStatement: (accountId: string) => void;
  onEditStatement: (stmt: CreditCardStatement) => void;
  onDeleteStatement: (stmtId: string) => void;
  remainingToPay: Decimal;
  paidPct: number;
}>) {
  return (
    <div className="account-card-statement">
      {stmt ? (
        <div className="account-statement-block">
          <div className="account-statement-bar">
            <button
              type="button"
              onClick={onToggle}
              className={`account-statement-trigger ${isExpanded ? 'is-open' : ''}`}
              aria-expanded={isExpanded}
            >
              <div className="account-statement-trigger-left">
                <FileText className="w-3.5 h-3.5 text-accent-strong" aria-hidden="true" />
                <span className="account-statement-trigger-label">
                  Estado de cuenta · {MONTH_SHORT[(stmt.month ?? 1) - 1] ?? stmt.month}{' '}
                  {stmt.year}
                </span>
                <span
                  className={`account-statement-pill ${
                    remainingToPay.lte(0) ? 'is-paid' : 'is-pending'
                  }`}
                >
                  {remainingToPay.lte(0)
                    ? 'Al día'
                    : `Falta $ ${formatMoney(remainingToPay)}`}
                </span>
              </div>
              <span className="app-disclosure-chevron" aria-hidden="true">
                <ChevronDown className="w-3.5 h-3.5" />
              </span>
            </button>

            <div className="account-statement-actions">
              <button
                type="button"
                aria-label={`Editar estado de cuenta de ${account.name}`}
                title="Editar estado de cuenta"
                onClick={() => onEditStatement(stmt)}
              >
                <Edit className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Eliminar estado de cuenta de ${account.name}`}
                title="Eliminar estado de cuenta"
                onClick={() => onDeleteStatement(stmt.id)}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            className="account-statement-mini-progress"
            title={`Abonado: ${paidPct.toFixed(0)}%`}
          >
            <div style={{ width: `${paidPct}%` }} />
          </div>

          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="app-disclosure-body"
              >
                <StatementDrawer
                  stmt={stmt}
                  account={account}
                  remainingToPay={remainingToPay}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onCreateStatement(account.id)}
          className="account-statement-empty"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Agregar estado de cuenta
        </button>
      )}
    </div>
  );
}

function AccountBalanceSection({
  account,
  isCredit,
  displayBal,
  totalUserDebtCents,
  totalOthersDebtCents,
}: Readonly<{
  account: Account;
  isCredit: boolean;
  displayBal: Decimal;
  totalUserDebtCents: Decimal;
  totalOthersDebtCents: Decimal;
}>) {
  return (
    <div className="account-card-balance">
      <div className="account-card-balance-main">
        <span className="account-card-balance-label">
          {isCredit ? 'Deuda utilizada' : 'Saldo disponible'}
        </span>
        <strong className="account-card-balance-figure">
          $ {formatMoney(isCredit ? displayBal : account.balance)}
        </strong>
      </div>

      {isCredit ? (
        <div className="account-card-inline-split">
          <span>
            Tu parte: <strong>$ {formatMoney(totalUserDebtCents)}</strong>
          </span>
          <span className="account-card-dot">·</span>
          <span>
            Terceros: <strong>$ {formatMoney(totalOthersDebtCents)}</strong>
          </span>
          {account.credit_limit ? (
            <>
              <span className="account-card-dot">·</span>
              <span>
                Cupo: <strong>$ {formatMoney(account.credit_limit)}</strong>
              </span>
            </>
          ) : null}
        </div>
      ) : (
        (account.description || account.statement_day || account.payment_day) && (
          <div className="account-card-inline-split">
            {account.description && <span>{account.description}</span>}
          </div>
        )
      )}
    </div>
  );
}

const Accounts = () => {
  const queryClient = useQueryClient();
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [statementForm, setStatementForm] = useState(emptyStatementForm);
  const [editingStatement, setEditingStatement] =
    useState<CreditCardStatement | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    id: string | null;
  }>({ isOpen: false, id: null });
  const [deleteStatementConfirm, setDeleteStatementConfirm] = useState<{
    isOpen: boolean;
    id: string | null;
  }>({ isOpen: false, id: null });

  const {
    data: accounts = [],
    isLoading: accountsLoading,
    isError: accountsError,
    refetch: refetchAccounts,
  } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => accountsAPI.getAll().then((res) => res.data ?? []),
  });

  const {
    data: statements = [],
    isLoading: statementsLoading,
    isError: statementsError,
    refetch: refetchStatements,
  } = useQuery<CreditCardStatement[]>({
    queryKey: ['statements'],
    queryFn: () => statementsAPI.getAll().then((res) => res.data ?? []),
  });

  const isLoading = accountsLoading || statementsLoading;
  const isError = accountsError || statementsError;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['statements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
    queryClient.invalidateQueries({ queryKey: ['netWorth'] });
    queryClient.invalidateQueries({ queryKey: ['cashFlowForecast'] });
    queryClient.invalidateQueries({ queryKey: ['paymentAlerts'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload: AccountPayload) => accountsAPI.create(payload),
    onSuccess: () => {
      invalidateAll();
      setShowCreateModal(false);
      setForm(emptyForm);
      setToast({ message: 'Cuenta creada', type: 'success' });
    },
    onError: (error: ApiError) =>
      setToast({
        message: error.response?.data?.detail || 'Error al crear cuenta',
        type: 'error',
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AccountPayload }) =>
      accountsAPI.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setShowEditModal(false);
      setEditingAccount(null);
      setEditForm(emptyForm);
      setToast({ message: 'Cuenta actualizada', type: 'success' });
    },
    onError: (error: ApiError) =>
      setToast({
        message: error.response?.data?.detail || 'Error al actualizar cuenta',
        type: 'error',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => accountsAPI.delete(id),
    onSuccess: () => {
      invalidateAll();
      setToast({ message: 'Cuenta eliminada', type: 'success' });
    },
    onError: (error: ApiError) =>
      setToast({
        message: error.response?.data?.detail || 'Error al eliminar cuenta',
        type: 'error',
      }),
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
    onError: (error: ApiError) =>
      setToast({
        message:
          error.response?.data?.detail || 'Error al crear estado de cuenta',
        type: 'error',
      }),
  });

  const updateStatementMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: StatementPayload;
    }) => statementsAPI.update(id, payload),
    onSuccess: () => {
      invalidateAll();
      setShowStatementModal(false);
      setStatementForm(emptyStatementForm);
      setEditingStatement(null);
      setToast({ message: 'Estado de cuenta actualizado', type: 'success' });
    },
    onError: (error: ApiError) =>
      setToast({
        message:
          error.response?.data?.detail ||
          'Error al actualizar estado de cuenta',
        type: 'error',
      }),
  });

  const deleteStatementMutation = useMutation({
    mutationFn: (id: string) => statementsAPI.delete(id),
    onSuccess: () => {
      invalidateAll();
      setToast({ message: 'Estado de cuenta eliminado', type: 'success' });
    },
    onError: (error: ApiError) =>
      setToast({
        message:
          error.response?.data?.detail || 'Error al eliminar estado de cuenta',
        type: 'error',
      }),
    onSettled: () => setDeleteStatementConfirm({ isOpen: false, id: null }),
  });

  const saving =
    createMutation.isPending ||
    updateMutation.isPending ||
    createStatementMutation.isPending ||
    updateStatementMutation.isPending;

  const latestStatementByAccount = useMemo(
    () => getLatestStatementByAccount(statements),
    [statements],
  );

  const summaryMetrics = useMemo(() => {
    const liquidBalance = calculateLiquidBalance(accounts);
    const creditDebt = calculateCreditCardDebt(accounts, statements);
    const activeCount = accounts.filter((acc) => isAccountActive(acc)).length;

    return { liquidBalance, creditDebt, activeCount };
  }, [accounts, statements]);

  const handleCreateStatement = (accountId: string) => {
    setStatementForm({ ...emptyStatementForm, account_id: accountId });
    setEditingStatement(null);
    setShowStatementModal(true);
  };

  const handleEditStatement = (stmt: CreditCardStatement) => {
    setEditingStatement(stmt);
    setStatementForm({
      account_id: stmt.account_id,
      statement_balance: toDecimal(stmt.statement_balance)
        .dividedBy(100)
        .toString(),
      user_share: toDecimal(stmt.user_share).dividedBy(100).toString(),
      payment_due_date: stmt.payment_due_date?.slice(0, 10) ?? '',
      cut_off_date: stmt.cut_off_date?.slice(0, 10) ?? '',
      amount_paid: toDecimal(stmt.amount_paid).dividedBy(100).toString(),
      status: stmt.status,
      month: stmt.month,
      year: stmt.year,
      notes: stmt.notes || '',
    });
    setShowStatementModal(true);
  };

  const handleDeleteStatement = (stmtId: string) => {
    setDeleteStatementConfirm({ isOpen: true, id: stmtId });
  };
  const confirmDeleteStatement = () => {
    if (deleteStatementConfirm.id) {
      deleteStatementMutation.mutate(deleteStatementConfirm.id);
    }
  };

  const handleStatementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      account_id: statementForm.account_id,
      statement_balance: toCents(statementForm.statement_balance || 0),
      user_share: toCents(statementForm.user_share || 0),
      payment_due_date: statementForm.payment_due_date
        ? statementForm.payment_due_date + 'T00:00:00'
        : null,
      cut_off_date: statementForm.cut_off_date
        ? statementForm.cut_off_date + 'T00:00:00'
        : null,
      amount_paid: toCents(statementForm.amount_paid || 0),
      status: statementForm.status,
      month: Number.parseInt(statementForm.month.toString()),
      year: Number.parseInt(statementForm.year.toString()),
      notes: statementForm.notes || null,
    };
    if (editingStatement)
      updateStatementMutation.mutate({ id: editingStatement.id, payload });
    else createStatementMutation.mutate(payload);
  };

  const handleDelete = (id: string) => setDeleteConfirm({ isOpen: true, id });
  const confirmDelete = () => {
    if (deleteConfirm.id) deleteMutation.mutate(deleteConfirm.id);
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setEditForm({
      name: account.name,
      account_type: account.account_type,
      balance: toDecimal(account.balance).dividedBy(100).toString(),
      currency: account.currency || 'USD',
      credit_limit: account.credit_limit
        ? toDecimal(account.credit_limit).dividedBy(100).toString()
        : '',
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
      account_type: form.account_type as Account['account_type'],
      balance: toCents(form.balance || 0),
      credit_limit: form.credit_limit ? toCents(form.credit_limit) : null,
      statement_day: form.statement_day
        ? Number.parseInt(form.statement_day)
        : null,
      payment_day: form.payment_day ? Number.parseInt(form.payment_day) : null,
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
        credit_limit: editForm.credit_limit
          ? toCents(editForm.credit_limit)
          : null,
        statement_day: editForm.statement_day
          ? Number.parseInt(editForm.statement_day)
          : null,
        payment_day: editForm.payment_day
          ? Number.parseInt(editForm.payment_day)
          : null,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="app-page">
        <output className="app-inline-message">
          Sincronizando cuentas…
        </output>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="app-page">
        <div className="app-empty-state">
          <h2>No se pudieron cargar las cuentas</h2>
          <p>Verifica la conexión con el servidor e inténtalo de nuevo.</p>
          <button
            type="button"
            onClick={() => {
              void refetchAccounts();
              void refetchStatements();
            }}
            className="app-btn app-btn-primary"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-page accounts-page">
      <div className="app-page-heading">
        <div>
          <h1 className="app-page-title">Cuentas</h1>
          <p>Saldos bancarios, tarjetas de crédito y estados de cuenta.</p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="app-btn app-btn-primary"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Nueva cuenta</span>
        </button>
      </div>

      {accounts.length > 0 && (
        <section className="app-summary-grid" aria-label="Resumen de cuentas">
          <article className="app-summary-card">
            <span>Liquidez en cuentas</span>
            <strong className="text-success">
              $ {formatMoney(summaryMetrics.liquidBalance)}
            </strong>
          </article>
          <article className="app-summary-card">
            <span>Deuda total en tarjetas</span>
            <strong className="text-danger">
              $ {formatMoney(summaryMetrics.creditDebt)}
            </strong>
          </article>
          <article className="app-summary-card">
            <span>Cuentas activas</span>
            <strong>
              {summaryMetrics.activeCount} de {accounts.length}
            </strong>
          </article>
        </section>
      )}

      {accounts.length === 0 ? (
        <div className="app-empty-state">
          <h2>Aún no hay cuentas registradas</h2>
          <p>
            Registra tus cuentas bancarias o tarjetas para hacer seguimiento de
            saldos y vencimientos.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="app-btn app-btn-primary"
          >
            Registrar primera cuenta
          </button>
        </div>
      ) : (
        <div className="accounts-grid">
          <AnimatePresence mode="popLayout">
            {accounts.map((account, index) => {
              const isCredit = account.account_type === 'credit_card';
              const stmt = isCredit
                ? latestStatementByAccount.get(account.id)
                : undefined;
              const isExpanded = expandedCard === account.id;
              const accountAccent = getAccountAccent(account.account_type);

              const bal = toDecimal(account.balance).abs();
              const stmtBal = stmt
                ? toDecimal(stmt.statement_balance)
                : new Decimal(0);
              const displayBal =
                isCredit && bal.lt(stmtBal) ? stmtBal : bal;

              const accountStatements = isCredit
                ? statements.filter((s) => s.account_id === account.id)
                : [];
              const totalOthersDebtCents = accountStatements.reduce(
                (acc, s) =>
                  acc.plus(
                    toDecimal(s.statement_balance).minus(
                      toDecimal(s.user_share),
                    ),
                  ),
                new Decimal(0),
              );
              const totalUserDebtCents = clampZero(
                displayBal.minus(totalOthersDebtCents),
              );

              const remainingToPay = stmt
                ? clampZero(
                    toDecimal(stmt.statement_balance).minus(
                      toDecimal(stmt.amount_paid),
                    ),
                  )
                : new Decimal(0);
              const paidPct = stmt
                ? Math.min(
                    100,
                    (Number.parseFloat(toDecimal(stmt.amount_paid).toString()) /
                      Math.max(
                        1,
                        Number.parseFloat(
                          toDecimal(stmt.statement_balance).toString(),
                        ),
                      )) *
                      100,
                  )
                : 0;

              return (
                <motion.article
                  key={account.id}
                  layout
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="account-card"
                  style={{ '--account-color': accountAccent } as CSSProperties}
                >
                  {/* Compact Header Row */}
                  <div className="account-card-top">
                    <div className="account-card-identity">
                      <div className="account-card-icon" aria-hidden="true">
                        {getAccountIcon(account.account_type)}
                      </div>
                      <div className="account-card-title">
                        <div className="account-card-meta-row">
                          <span>{getAccountTypeLabel(account.account_type)}</span>
                          <span className="account-card-dot">·</span>
                          <span>{account.bank_name || 'Personal'}</span>
                          {account.linked_account_id && (
                            <span className="account-card-linked">
                              <Link className="w-2.5 h-2.5" aria-hidden="true" />
                              <span>Vinculada</span>
                            </span>
                          )}
                        </div>
                        <h3>{account.name}</h3>
                      </div>
                    </div>

                    <div className="account-card-actions">
                      <span
                        className={`account-card-status ${
                          account.is_active ? 'is-active' : 'is-inactive'
                        }`}
                      >
                        <i aria-hidden="true" />
                        {account.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                      <button
                        type="button"
                        aria-label={`Editar ${account.name}`}
                        title="Editar cuenta"
                        onClick={() => handleEdit(account)}
                        className="account-card-action account-card-action-edit"
                      >
                        <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Eliminar ${account.name}`}
                        title="Eliminar cuenta"
                        onClick={() => handleDelete(account.id)}
                        className="account-card-action account-card-action-delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <AccountBalanceSection
                    account={account}
                    isCredit={isCredit}
                    displayBal={displayBal}
                    totalUserDebtCents={totalUserDebtCents}
                    totalOthersDebtCents={totalOthersDebtCents}
                  />

                  {isCredit && (
                    <AccountStatementSection
                      account={account}
                      stmt={stmt}
                      isExpanded={isExpanded}
                      onToggle={() =>
                        setExpandedCard(isExpanded ? null : account.id)
                      }
                      onCreateStatement={handleCreateStatement}
                      onEditStatement={handleEditStatement}
                      onDeleteStatement={handleDeleteStatement}
                      remainingToPay={remainingToPay}
                      paidPct={paidPct}
                    />
                  )}
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

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

      <ConfirmDialog
        isOpen={deleteStatementConfirm.isOpen}
        title="Eliminar estado de cuenta"
        message="¿Estás seguro de eliminar este estado de cuenta? Esta acción no se puede deshacer."
        onConfirm={confirmDeleteStatement}
        onCancel={() => setDeleteStatementConfirm({ isOpen: false, id: null })}
      />
    </div>
  );
};

export default Accounts;

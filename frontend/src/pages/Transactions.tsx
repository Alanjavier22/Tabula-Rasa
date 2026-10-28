import { useSearchParams } from "react-router-dom";
import Select from "../components/common/Select";
import { filterTransactions } from "../utils/transactionFilters";
import { useState, useDeferredValue, useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  transactionsAPI,
  categoriesAPI,
  accountsAPI,
  goalsAPI,
} from "../services/api";
import type {
  TransactionType,
  PaymentMethod,
  ExpenseType,
  Transaction,
} from "../types";
import { formatMoney, toCents } from "../utils/money";
import {
  Plus,
  Upload,
  Mic,
  MicOff,
  FileImage,
  Search,
  CreditCard,
} from "lucide-react";
import AccountImportModal from "../components/AccountImportModal";
import DocumentImportModal from "../components/DocumentImportModal";
import StatementImportModal from "../components/StatementImportModal";
import Toast from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";
import TransactionForm from "../components/TransactionForm";
import type { TransactionFormData } from "../components/TransactionForm";
import DatePicker from "../components/common/DatePicker";
import { VirtualTransactionList } from "../components/transactions/VirtualTransactionList";
import { useAudioTransactionCapture } from "../hooks/useAudioTransactionCapture";

const emptyForm: TransactionFormData = {
  description: "",
  amount: "",
  transaction_type: "expense" as TransactionType,
  payment_method: "transfer" as PaymentMethod,
  date: new Date().toISOString(),
  category_id: "",
  account_id: "",
  expense_type: "variable" as ExpenseType,
  goal_id: "",
  beneficiary: "",
};

const Transactions = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showModal, setShowModal] = useState(
    () => searchParams.get("new") === "1",
  );
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    id: string | null;
  }>({ isOpen: false, id: null });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDocumentImportModal, setShowDocumentImportModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);

  // Search and date range filters
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");

  // AI categorization status
  const [isAICategorizing, setIsAICategorizing] = useState(false);
  const [aiCategorizationTimer, setAiCategorizationTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Fetch transactions with React Query
  const {
    data: transactions,
    isLoading: transactionsLoading,
    isError: transactionsError,
    refetch: refetchTransactions,
  } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => transactionsAPI.getAll().then((res) => res.data),
  });

  // Fetch categories
  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesAPI.getAll().then((res) => res.data),
  });

  // Fetch accounts
  const {
    data: accounts,
    isLoading: accountsLoading,
    isError: accountsError,
  } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => accountsAPI.getAll().then((res) => res.data),
  });

  // Fetch goals
  const {
    data: goals,
    isLoading: goalsLoading,
    isError: goalsError,
  } = useQuery({
    queryKey: ["goals"],
    queryFn: () => goalsAPI.getAll().then((res) => res.data),
  });

  const loading =
    transactionsLoading || categoriesLoading || accountsLoading || goalsLoading;
  const loadError =
    transactionsError || categoriesError || accountsError || goalsError;

  const { isRecording, processingAudio, startRecording, stopRecording } =
    useAudioTransactionCapture((extractedForm) => {
      setForm(extractedForm);
      setShowModal(true);
    }, setToast);

  // FASE 6.2: Optimistic delete handler
  const handleDelete = (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id === null) return;

    try {
      await transactionsAPI.delete(deleteConfirm.id);
      setToast({ message: "Transacción eliminada", type: "success" });
      setDeleteConfirm({ isOpen: false, id: null });
      refetchTransactions();

      // Invalidate dashboard queries
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
      queryClient.invalidateQueries({ queryKey: ["safeToSpend"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["statements"] });
      queryClient.invalidateQueries({ queryKey: ["cashFlowForecast"] });
      queryClient.invalidateQueries({ queryKey: ["netWorth"] });
      queryClient.invalidateQueries({ queryKey: ["vehicleTelemetry"] });
    } catch (error) {
      console.error("Error deleting transaction:", error);
      setToast({ message: "Error al eliminar transacción", type: "error" });
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setForm({
      description: transaction.description || "",
      amount: formatMoney(transaction.amount),
      transaction_type: transaction.transaction_type as TransactionType,
      payment_method:
        transaction.payment_method || ("transfer" as PaymentMethod),
      date: transaction.date || new Date().toISOString(),
      category_id: transaction.category_id || "",
      account_id: transaction.account_id || "",
      expense_type: "variable" as ExpenseType,
      goal_id: transaction.goal_id || "",
      beneficiary: transaction.beneficiary || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (formData: TransactionFormData) => {
    try {
      if (editingTransaction) {
        const amountCents = toCents(
          Number.parseFloat(formData.amount.replace(/[^0-9.-]/g, "")),
        );
        await transactionsAPI.update(editingTransaction.id, {
          description: formData.description,
          amount: amountCents,
          transaction_type: formData.transaction_type,
          date: formData.date,
          category_id: formData.category_id || null,
          account_id: formData.account_id || null,
          payment_method: formData.payment_method,
          expense_type: formData.expense_type,
          goal_id: formData.goal_id || null,
        });
        setToast({ message: "Transacción actualizada", type: "success" });
      } else {
        const amountCents = toCents(
          Number.parseFloat(formData.amount.replace(/[^0-9.-]/g, "")),
        );
        await transactionsAPI.create({
          description: formData.description,
          amount: amountCents,
          transaction_type: formData.transaction_type,
          date: formData.date,
          category_id: formData.category_id || null,
          account_id: formData.account_id || null,
          payment_method: formData.payment_method,
          expense_type: formData.expense_type,
          goal_id: formData.goal_id || null,
        });
        setToast({ message: "Transacción creada", type: "success" });
      }

      setShowModal(false);
      setEditingTransaction(null);
      setForm(emptyForm);
      refetchTransactions();

      // Invalidate dashboard queries
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
      queryClient.invalidateQueries({ queryKey: ["safeToSpend"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["statements"] });
      queryClient.invalidateQueries({ queryKey: ["cashFlowForecast"] });
      queryClient.invalidateQueries({ queryKey: ["netWorth"] });
      queryClient.invalidateQueries({ queryKey: ["vehicleTelemetry"] });
    } catch (error) {
      console.error("Error saving transaction:", error);
      setToast({
        message:
          "No se pudo guardar la transacción. Tus datos siguen en el formulario.",
        type: "error",
      });
      throw error;
    }
  };

  // Trigger AI categorization status after CSV import
  const handleImportSuccess = (importedCount: number) => {
    if (importedCount > 0) {
      setIsAICategorizing(true);
      setToast({
        message: `✅ ${importedCount} transacciones importadas. La IA está analizando y categorizando en segundo plano...`,
        type: "success",
      });

      // Poll for 30 seconds to show AI categorization progress
      setAiCategorizationTimer(
        setTimeout(() => {
          setIsAICategorizing(false);
          refetchTransactions();
          queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
          queryClient.invalidateQueries({ queryKey: ["safeToSpend"] });
          queryClient.invalidateQueries({ queryKey: ["accounts"] });
          queryClient.invalidateQueries({ queryKey: ["expenseBreakdown"] });
        }, 30000),
      );

      // Also refetch immediately to show imported transactions
      refetchTransactions();
      queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
      queryClient.invalidateQueries({ queryKey: ["safeToSpend"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["statements"] });
      queryClient.invalidateQueries({ queryKey: ["cashFlowForecast"] });
      queryClient.invalidateQueries({ queryKey: ["netWorth"] });
      queryClient.invalidateQueries({ queryKey: ["vehicleTelemetry"] });
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (aiCategorizationTimer) {
        clearTimeout(aiCategorizationTimer);
      }
    };
  }, [aiCategorizationTimer]);

  // Filter transactions based on search and date range
  const filteredTransactions = useMemo(
    () =>
      filterTransactions(
        transactions ?? [],
        deferredSearchQuery,
        startDate,
        endDate,
        categoryFilter,
        accountFilter,
      ),
    [
      transactions,
      deferredSearchQuery,
      startDate,
      endDate,
      categoryFilter,
      accountFilter,
    ],
  );
  const filtersActive = Boolean(
    searchQuery || startDate || endDate || categoryFilter || accountFilter,
  );
  const clearFilters = () => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setCategoryFilter("");
    setAccountFilter("");
  };

  // Compute summary for filtered transactions
  const summary = useMemo(() => {
    return filteredTransactions.reduce(
      (acc, txn) => {
        const amount = Number(txn.amount);
        if (txn.transaction_type === "income") {
          acc.income += amount;
        } else if (txn.transaction_type === "expense") {
          acc.expenses += amount;
        }
        return acc;
      },
      { income: 0, expenses: 0 },
    );
  }, [filteredTransactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-primary">
        Cargando...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <p className="text-primary font-medium">
          No se pudieron cargar las transacciones.
        </p>
        <button
          onClick={() => {
            for (const key of [
              "transactions",
              "categories",
              "accounts",
              "goals",
            ])
              void queryClient.refetchQueries({ queryKey: [key] });
          }}
          className="px-4 py-2 rounded-lg bg-accent-strong hover:bg-accent-strong text-on-color text-sm font-semibold transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="app-page transactions-page">
      <div className="app-page-heading">
        <div>
          <h1>Transacciones</h1>
          <p>Registra movimientos y consulta tu actividad.</p>
        </div>
        <div className="transactions-actions">
          <button
            type="button"
            className="app-btn app-btn-primary"
            onClick={() => {
              setEditingTransaction(null);
              setForm({ ...emptyForm, date: new Date().toISOString() });
              setShowModal(true);
            }}
          >
            <Plus aria-hidden="true" />
            Nueva transacción
          </button>
          <details className="app-action-menu" onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
            <summary className="app-btn">
              <Upload aria-hidden="true" />
              Importar
            </summary>
            <div className="app-action-menu-content">
              <button type="button" onClick={() => setShowImportModal(true)}>
                <Upload aria-hidden="true" />
                Movimientos de cuenta
              </button>
              <button type="button" onClick={() => setShowStatementModal(true)}>
                <CreditCard aria-hidden="true" />
                Estado de tarjeta
              </button>
              <button
                type="button"
                onClick={() => setShowDocumentImportModal(true)}
              >
                <FileImage aria-hidden="true" />
                Escanear recibo
              </button>
            </div>
          </details>
          <button
            type="button"
            className="app-btn"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={processingAudio}
            aria-pressed={isRecording}
          >
            {isRecording ? (
              <MicOff aria-hidden="true" />
            ) : (
              <Mic aria-hidden="true" />
            )}
            {processingAudio
              ? "Procesando…"
              : isRecording
                ? "Detener grabación"
                : "Dictar"}
          </button>
        </div>
      </div>
      <dl className="transactions-summary">
        <div>
          <dt>Ingresos del resultado</dt>
          <dd className="text-success">$ {formatMoney(summary.income)}</dd>
        </div>
        <div>
          <dt>Gastos del resultado</dt>
          <dd>$ {formatMoney(summary.expenses)}</dd>
        </div>
        <div>
          <dt>Balance del resultado</dt>
          <dd>$ {formatMoney(summary.income - summary.expenses)}</dd>
        </div>
      </dl>
      {isAICategorizing && (
        <p role="status" className="app-inline-message">
          Clasificación de las transacciones importadas en curso…
        </p>
      )}
      <section
        className="app-surface transactions-filters"
        aria-label="Filtros de transacciones"
      >
        <div className="transactions-search">
          <label htmlFor="transaction-search">Buscar movimiento</label>
          <div>
            <Search aria-hidden="true" />
            <input
              id="transaction-search"
              type="search"
              placeholder="Descripción o beneficiario"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="transactions-from">Desde</label>
          <DatePicker
            id="transactions-from"
            value={startDate}
            onChange={setStartDate}
          />
        </div>
        <div>
          <label htmlFor="transactions-until">Hasta</label>
          <DatePicker
            id="transactions-until"
            value={endDate}
            onChange={setEndDate}
          />
        </div>
        <details className="transactions-extra-filters">
          <summary>Más filtros</summary>
          <div className="transactions-filter-options">
            <div>
              <label htmlFor="transactions-category">Categoría</label>
              <Select
                id="transactions-category"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: "", label: "Todas las categorías" },
                  ...(categories ?? []).map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
              />
            </div>
            <div>
              <label htmlFor="transactions-account">Cuenta</label>
              <Select
                id="transactions-account"
                value={accountFilter}
                onChange={setAccountFilter}
                options={[
                  { value: "", label: "Todas las cuentas" },
                  ...(accounts ?? []).map((account) => ({
                    value: account.id,
                    label: account.name,
                  })),
                ]}
              />
            </div>
          </div>
        </details>
        {startDate && endDate && startDate > endDate && (
          <p role="alert" className="text-danger">
            La fecha inicial debe ser anterior o igual a la final.
          </p>
        )}
        <div className="transactions-result-count">
          <p role="status">
            {filteredTransactions.length} movimientos
            {filtersActive ? " encontrados" : ""}
          </p>
          {filtersActive && (
            <button
              type="button"
              className="app-btn app-btn-quiet"
              onClick={clearFilters}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>
      <section
        className="app-surface transactions-results"
        aria-label="Movimientos"
        aria-busy={searchQuery !== deferredSearchQuery}
      >
        {filteredTransactions.length ? (
          <VirtualTransactionList
            key={`${deferredSearchQuery}-${startDate}-${endDate}-${categoryFilter}-${accountFilter}`}
            transactions={filteredTransactions}
            rowHeight={132}
            visibleRowCount={8}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <div className="app-empty-state">
            <h2>
              {transactions?.length
                ? "No hay coincidencias"
                : "Tu actividad empieza aquí"}
            </h2>
            <p>
              {transactions?.length
                ? "Prueba otra búsqueda o elimina los filtros para ver más movimientos."
                : "Registra tu primera transacción o importa movimientos desde tu cuenta."}
            </p>
            <button
              type="button"
              className="app-btn"
              onClick={
                transactions?.length ? clearFilters : () => setShowModal(true)
              }
            >
              {transactions?.length
                ? "Limpiar filtros"
                : "Registrar transacción"}
            </button>
          </div>
        )}
      </section>
      <AnimatePresence>
        {showImportModal && (
          <AccountImportModal
            onClose={() => setShowImportModal(false)}
            onSuccess={handleImportSuccess}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDocumentImportModal && (
          <DocumentImportModal
            onClose={() => setShowDocumentImportModal(false)}
            onSuccess={() => {
              setToast({
                message: "Recibo procesado y guardado con éxito",
                type: "success",
              });
              refetchTransactions();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStatementModal && (
          <StatementImportModal
            onClose={() => setShowStatementModal(false)}
            onSuccess={(count) => {
              setToast({
                message: `¡Excelente! ${count} transacciones importadas y balance de tarjeta actualizado.`,
                type: "success",
              });
              refetchTransactions();
              queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
              queryClient.invalidateQueries({ queryKey: ["statements"] });
              queryClient.invalidateQueries({ queryKey: ["accounts"] });
            }}
          />
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
        title="Eliminar Transacción"
        message="¿Estás seguro de que quieres eliminar esta transacción? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />

      <AnimatePresence>
        {showModal && (
          <TransactionForm
            initialData={form}
            initialSplits={editingTransaction?.splits}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowModal(false);
              setEditingTransaction(null);
              setForm(emptyForm);
            }}
            saving={false}
            title={
              editingTransaction ? "Editar Transacción" : "Nueva Transacción"
            }
            categories={categories || []}
            accounts={accounts || []}
            goals={goals || []}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Transactions;

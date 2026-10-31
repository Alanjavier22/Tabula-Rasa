import { Link } from "react-router-dom";
import Modal from "../components/common/Modal";
import {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  lazy,
  Suspense,
} from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import Decimal from "decimal.js-light";
import {
  accountsAPI,
  statementsAPI,
  metricsAPI,
  budgetsAPI,
  snapshotsAPI,
  alertsAPI,
  transactionsAPI,
  subscriptionsAPI as subsAPI,
  categoriesAPI,
  goalsAPI,
  iousAPI,
  maintenanceAPI,
} from "../services/api";
import { formatMoney, toDecimal, clampZero } from "../utils/money";
import Toast from "../components/Toast";
import type {
  Account,
  CreditCardStatement,
  SafeToSpendResponse,
  NetWorthResponse,
  VehicleTelemetryResponse,
  CashFlowForecastResponse,
  DashboardSummaryResponse,
  AlertsResponse,
  IOU,
  Transaction,
  Subscription,
  Category,
  Goal,
  DebtShare,
} from "../types";
import type { EcuadorFiscalRules } from "../services/ReportingService";
import type { AxiosError } from "axios";
import { AnimatePresence } from "framer-motion";
import {
  Sparkles,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Plus,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight, ChevronDown,
} from "lucide-react";

import SafeToSpendCard from "../components/dashboard/SafeToSpendCard";
import SummaryCards from "../components/dashboard/SummaryCards";
import CreditCardSummary from "../components/dashboard/CreditCardSummary";
import IOUWidget from "../components/IOUWidget";
import DebtSharesWidget from "../components/DebtSharesWidget";
import SkeletonCard from "../components/dashboard/SkeletonCard";
import { WhatIfModal } from "../components/AIAssistant/WhatIfModal";
import { AIAnomalyScanner } from "../components/AIAssistant/AIAnomalyScanner";
import { IntegrityStatus } from "../components/IntegrityStatus";
import AIInsightsSection from "../components/dashboard/AIInsightsSection";
import PaymentAlertsPanel from "../components/dashboard/PaymentAlertsPanel";
import DashboardMetricsRow from "../components/dashboard/DashboardMetricsRow";

const ExpenseBreakdownChart = lazy(
  () => import("../components/dashboard/ExpenseBreakdownChart"),
);
const IncomeExpenseBarChart = lazy(
  () => import("../components/dashboard/IncomeExpenseBarChart"),
);
const DailySpendingChart = lazy(
  () => import("../components/dashboard/DailySpendingChart"),
);
const NetWorthChart = lazy(
  () => import("../components/dashboard/NetWorthChart"),
);
const CashFlowForecastChart = lazy(
  () => import("../components/dashboard/CashFlowForecastChart"),
);

// Referencia estable para fallback de queries sin datos: `|| []` crea un array nuevo en
// cada render, lo que invalida los useMemo que dependen de él (recomputan siempre en vez
// de solo cuando cambian los datos reales).
const EMPTY_ARRAY: never[] = [];

type DashboardSectionTab = "actividad" | "tendencias" | "compromisos" | "ia";

const Dashboard = () => {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [aiAlerts, setAiAlerts] = useState<string[]>([]);
  const [aiPatterns, setAiPatterns] = useState<string[]>([]);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);
  const [forecastDays, setForecastDays] = useState(30);
  const [showWhatIfModal, setShowWhatIfModal] = useState(false);
  const [showAnomalyScanner, setShowAnomalyScanner] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardSectionTab>("actividad");

  // Guards to prevent infinite loops and concurrent operations
  const isRefetchingRef = useRef(false);

  // React Query: Fetch Payment Alerts
  const {
    data: paymentAlerts,
    isPending: paymentsLoading,
    isError: paymentsError,
    refetch: refetchPayments,
  } = useQuery<AlertsResponse>({
    queryKey: ["paymentAlerts"],
    queryFn: async () => {
      const res = await alertsAPI.getPaymentReminders(30); // 30 days ahead
      return res.data;
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const paymentAlertsWithItems = paymentAlerts?.alerts?.length
    ? paymentAlerts
    : undefined;

  // React Query: Fetch multiple metrics and data in parallel
  const results = useQueries({
    queries: [
      {
        queryKey: ["pendingIOUs"],
        queryFn: () => iousAPI.getPending().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["accounts"],
        queryFn: () => accountsAPI.getAll().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["statements"],
        queryFn: () => statementsAPI.getAll().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["safeToSpend"],
        queryFn: async () => {
          const res = await metricsAPI.getSafeToSpend();
          return res.data;
        },
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["netWorth"],
        queryFn: () => metricsAPI.getNetWorth().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["vehicleTelemetry"],
        queryFn: () => metricsAPI.getVehicleTelemetry().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["budgets"],
        queryFn: () => budgetsAPI.getAll().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["cashFlowForecast", forecastDays],
        queryFn: () =>
          metricsAPI.getCashFlowForecast(forecastDays).then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["transactions"],
        queryFn: () => transactionsAPI.getAll().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["subscriptions"],
        queryFn: () => subsAPI.getAll().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["categories"],
        queryFn: () => categoriesAPI.getAll().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["dashboardSummary"],
        queryFn: async () => {
          try {
            const res = await metricsAPI.getDashboardSummary();
            return res.data;
          } catch (err) {
            console.error("Dashboard summary fetch failed:", err);
            return null;
          }
        },
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["configIVA"],
        queryFn: async () => {
          try {
            const { configAPI } = await import("../services/api");
            const { reportingService } =
              await import("../services/ReportingService");

            // Parallel fetch for all fiscal rates
            const [ivaRes, retSrcRes, retIvaRes] = await Promise.all([
              configAPI.getByKey("iva_rate"),
              configAPI.getByKey("retencion_source_rate"),
              configAPI.getByKey("retencion_iva_rate"),
            ]);

            const rules: Partial<EcuadorFiscalRules> = {};
            if (ivaRes.data?.value)
              rules.iva_rate = Number.parseFloat(ivaRes.data.value);
            if (retSrcRes.data?.value)
              rules.retencion_source_rate = Number.parseFloat(
                retSrcRes.data.value,
              );
            if (retIvaRes.data?.value)
              rules.retencion_iva_rate = Number.parseFloat(
                retIvaRes.data.value,
              );

            if (Object.keys(rules).length > 0) {
              reportingService.setFiscalRules(rules);
            }
            return rules;
          } catch {
            return null;
          }
        },
        staleTime: 600000, // 10 minutes cache for static config rates
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ["goals"],
        queryFn: () => goalsAPI.getAll().then((res) => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
    ],
  });

  const pendingIOUs = (results[0].data as IOU[]) || EMPTY_ARRAY;
  const accounts = (results[1].data as Account[]) || EMPTY_ARRAY;
  const statements = (results[2].data as CreditCardStatement[]) || EMPTY_ARRAY;
  const safeToSpend = results[3].data as unknown as
    | SafeToSpendResponse
    | undefined;
  const netWorth = results[4].data as NetWorthResponse | undefined;
  const vehicleTelemetry = results[5].data as
    | VehicleTelemetryResponse
    | undefined;
  const cashFlowForecast = results[7].data as
    | CashFlowForecastResponse
    | undefined;
  const transactions = (results[8].data as Transaction[]) || EMPTY_ARRAY;
  const subscriptions = (results[9].data as Subscription[]) || EMPTY_ARRAY;
  const categories = (results[10].data as Category[]) || EMPTY_ARRAY;
  const goals = (results[13].data as Goal[]) || EMPTY_ARRAY;
  const dashboardSummary = results[11].data as
    | DashboardSummaryResponse
    | undefined;

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const coreDataError =
    results[1].isError || results[8].isError || results[11].isError;
  const coreErrorNotifiedRef = useRef(false);
  useEffect(() => {
    if (coreDataError && !coreErrorNotifiedRef.current) {
      coreErrorNotifiedRef.current = true;
      setToast({
        message: "No se pudieron cargar algunos datos del dashboard",
        type: "error",
      });
    } else if (!coreDataError) {
      coreErrorNotifiedRef.current = false;
    }
  }, [coreDataError]);

  const insightsMutation = useMutation({
    mutationFn: () => metricsAPI.getInsights(),
    onSuccess: (response) => {
      setInsights(response.data.insights);
      setAiAlerts(response.data.alerts ?? []);
      setAiPatterns(response.data.patterns ?? []);
    },
    onError: (error: AxiosError<{ detail?: string }>) => {
      console.error("Error generating insights:", error);
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      if (status === 400) {
        setToast({
          message:
            detail ||
            "Configura tu Gemini API Key en la página de Configuración",
          type: "warning",
        });
      } else {
        setToast({ message: "Error generando análisis", type: "error" });
      }
    },
  });

  const healBalancesMutation = useMutation({
    mutationFn: () => maintenanceAPI.healBalances(),
    onSuccess: () => {
      setToast({
        message: "Balances sincronizados con éxito",
        type: "success",
      });
      results[1].refetch(); // accounts
      results[11].refetch(); // summary
    },
    onError: () => {
      setToast({ message: "Error al sincronizar balances", type: "error" });
    },
  });

  const handleCreateSnapshot = useCallback(async () => {
    if (creatingSnapshot || isRefetchingRef.current) {
      return;
    }

    const now = new Date();
    let month = now.getMonth();
    let year = now.getFullYear();

    if (month === 0) {
      month = 12;
      year -= 1;
    }

    const monthName = new Intl.DateTimeFormat("es-ES", {
      month: "long",
    }).format(new Date(year, month - 1));
    const confirmMessage = `¿Deseas cerrar el mes de ${monthName.toUpperCase()} ${year}?\n\nSe guardará un cierre mensual protegido en tu historial patrimonial.`;

    if (!window.confirm(confirmMessage)) return;

    setCreatingSnapshot(true);
    isRefetchingRef.current = true;

    try {
      await snapshotsAPI.create({ month, year, lock: true });
      setToast({
        message: `Mes de ${monthName} cerrado y bloqueado exitosamente`,
        type: "success",
      });

      results[11].refetch();
      results[13].refetch();
    } catch (error) {
      console.error("Error creating snapshot:", error);
      setToast({ message: "Error al cerrar mes contable", type: "error" });
    } finally {
      setCreatingSnapshot(false);
      isRefetchingRef.current = false;
    }
  }, [creatingSnapshot, results]);

  const totalBalance = useMemo(
    () =>
      accounts
        .filter(
          (acc) =>
            acc.account_type === "checking" || acc.account_type === "savings",
        )
        .reduce((sum, acc) => sum.plus(toDecimal(acc.balance)), new Decimal(0)),
    [accounts],
  );

  const latestStatements = useMemo(() => {
    const latestMap = new Map<string, CreditCardStatement>();
    statements.forEach((s) => {
      const current = latestMap.get(s.account_id);
      if (
        !current ||
        s.year > current.year ||
        (s.year === current.year && s.month > current.month)
      ) {
        latestMap.set(s.account_id, s);
      }
    });
    return Array.from(latestMap.values());
  }, [statements]);

  const totalCreditCardDebt = useMemo(
    () =>
      latestStatements.reduce(
        (sum, s) => sum.plus(toDecimal(s.statement_balance)),
        new Decimal(0),
      ),
    [latestStatements],
  );

  const totalIncome = useMemo(
    () => toDecimal(dashboardSummary?.total_income),
    [dashboardSummary],
  );
  const totalExpenses = useMemo(
    () => toDecimal(dashboardSummary?.total_expenses),
    [dashboardSummary],
  );
  const netBalance = useMemo(
    () => totalIncome.minus(totalExpenses),
    [totalIncome, totalExpenses],
  );

  const totalStatementGross = useMemo(
    () =>
      latestStatements.reduce(
        (sum, s) =>
          sum.plus(
            clampZero(toDecimal(s.user_share).minus(toDecimal(s.amount_paid))),
          ),
        new Decimal(0),
      ),
    [latestStatements],
  );

  const totalIOUsTheyOwe = useMemo(() => {
    return (pendingIOUs || [])
      .filter((iou: IOU) => {
        const type = String(iou.iou_type || "").toLowerCase();
        return type === "they_owe" || type.includes("they_owe");
      })
      .reduce(
        (sum: Decimal, iou: IOU) => sum.plus(toDecimal(iou.amount)),
        new Decimal(0),
      );
  }, [pendingIOUs]);

  const totalThirdPartyDebt = useMemo(() => {
    const debtSharesSum = latestStatements.reduce(
      (sum, s) =>
        sum.plus(
          (s.debt_shares ?? []).reduce(
            (ds: Decimal, d: DebtShare) =>
              ds.plus(d.status === "pending" ? toDecimal(d.amount) : 0),
            new Decimal(0),
          ),
        ),
      new Decimal(0),
    );
    return debtSharesSum.plus(totalIOUsTheyOwe);
  }, [latestStatements, totalIOUsTheyOwe]);

  const totalStatementDue = useMemo(
    () => totalStatementGross,
    [totalStatementGross],
  );

  const expenseBreakdown = useMemo(
    () => (dashboardSummary?.expense_breakdown ?? []).filter((item) => !/transferencia|ajuste|meta/i.test(item.name || "")),
    [dashboardSummary],
  );

  const dailySpending = useMemo(() => {
    const data = dashboardSummary?.daily_spending ?? [];
    return data.map((item) => ({
      ...item,
      gasto:
        typeof item.gasto === "string"
          ? Number.parseFloat(item.gasto) / 100
          : item.gasto / 100,
    }));
  }, [dashboardSummary]);

  const monthlyComparison = useMemo(() => {
    const dashboardData = dashboardSummary?.monthly_comparison ?? [];
    return dashboardData.map((item) => ({
      ...item,
      Ingresos:
        typeof item.Ingresos === "string"
          ? Number.parseFloat(item.Ingresos) / 100
          : item.Ingresos / 100,
      Gastos:
        typeof item.Gastos === "string"
          ? Number.parseFloat(item.Gastos) / 100
          : item.Gastos / 100,
    }));
  }, [dashboardSummary]);

  const creditCards = useMemo(
    () => accounts.filter((a) => a.account_type === "credit_card"),
    [accounts],
  );

  const vehicleCost = useMemo(
    () => toDecimal(dashboardSummary?.vehicle_cost),
    [dashboardSummary],
  );

  const recentTransactions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 6),
    [transactions],
  );

  return (
    <div className="app-page dashboard-page">
      <div className="app-page-heading">
        <div className="dashboard-heading-copy">
          <h1 className="app-page-title">Resumen financiero</h1>
          <p>Tu disponible, horizonte de liquidez y compromisos inmediatos.</p>
          <div className="dashboard-integrity">
            <IntegrityStatus
              accounts={accounts}
              statements={statements}
              isLoading={results[1].isLoading || results[2].isLoading}
            />
          </div>
        </div>
        <div className="dashboard-heading-actions">
          <Link to="/transactions?new=1" className="app-btn app-btn-primary">
            <Plus aria-hidden="true" />
            Nueva transacción
          </Link>
          <details
            className="app-action-menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary className="app-btn">
              <MoreHorizontal aria-hidden="true" />
              <span>Más acciones</span><ChevronDown className="w-3.5 h-3.5 app-menu-chevron" aria-hidden="true" />
            </summary>
            <div className="app-action-menu-content">
              <button
                type="button"
                onClick={() => healBalancesMutation.mutate()}
                disabled={healBalancesMutation.isPending}
              >
                <RefreshCw aria-hidden="true" />
                {healBalancesMutation.isPending
                  ? "Sincronizando…"
                  : "Sincronizar saldos"}
              </button>
              <button type="button" onClick={() => setShowAnomalyScanner(true)}>
                <AlertTriangle aria-hidden="true" />
                Revisar gastos con IA
              </button>
              <button type="button" onClick={() => setShowWhatIfModal(true)}>
                <Sparkles aria-hidden="true" />
                Simular escenario
              </button>
              <button
                type="button"
                onClick={handleCreateSnapshot}
                disabled={creatingSnapshot}
              >
                <Calendar aria-hidden="true" />
                {creatingSnapshot ? "Cerrando…" : "Cerrar mes"}
              </button>
            </div>
          </details>
        </div>
      </div>

      {dashboardSummary && results[1].data ? (
        <SummaryCards
          balance={totalBalance}
          creditCardDebt={totalCreditCardDebt}
          income={totalIncome}
          expenses={totalExpenses}
        />
      ) : results[11].isError || results[1].isError ? (
        <p role="status" className="app-inline-message">
          No se pudieron obtener los indicadores.{" "}
          <button
            type="button"
            className="app-btn"
            onClick={() => {
              void results[11].refetch();
              void results[1].refetch();
            }}
          >
            Reintentar indicadores
          </button>
        </p>
      ) : (
        <div className="app-summary-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Editorial 2-Column Overview: Liquidity Forecast on the left, Safe-to-Spend + Upcoming Payments on the right */}
      <div className="dashboard-overview-grid">
        <Suspense fallback={<SkeletonCard />}>
          <CashFlowForecastChart
            cashFlowForecast={cashFlowForecast}
            forecastDays={forecastDays}
            setForecastDays={setForecastDays}
          />
        </Suspense>

        <div className="dashboard-overview-rail">
          <SafeToSpendCard
            data={safeToSpend}
            isLoading={results[3].isPending}
            hasError={results[3].isError}
            isFetching={results[3].isFetching}
            onRetry={() => {
              void results[3].refetch();
            }}
          />

          <section
            className="dashboard-rail-payments"
            aria-labelledby="payments-heading"
          >
            <div className="app-section-heading">
              <h2 id="payments-heading" className="app-section-title">
                Próximos pagos (30 días)
              </h2>
              <Link to="/reminders" className="app-text-link">
                Calendario
              </Link>
            </div>
            {paymentAlertsWithItems ? (
              <PaymentAlertsPanel data={paymentAlertsWithItems} />
            ) : paymentsLoading ? (
              <p role="status" className="app-inline-message">
                Consultando próximos pagos…
              </p>
            ) : paymentsError ? (
              <p role="status" className="app-inline-message">
                No se pudieron consultar los vencimientos.{" "}
                <button
                  type="button"
                  className="app-btn"
                  onClick={() => {
                    void refetchPayments();
                  }}
                >
                  Reintentar pagos
                </button>
              </p>
            ) : (
              <p className="dashboard-rail-empty">
                Sin vencimientos registrados para los próximos 30 días.
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Editorial Segmented Section Navigation (replaces ugly <details> disclosure accordions) */}
      <section
        className="dashboard-editorial-workspace"
        aria-label="Secciones de análisis detallado"
      >
        <div className="dashboard-section-bar">
          <div
            className="dashboard-view-tabs"
            role="tablist"
            aria-label="Vistas del resumen financiero"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "actividad"}
              className={`dashboard-view-tab ${
                activeTab === "actividad" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("actividad")}
            >
              Actividad y categorías
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "tendencias"}
              className={`dashboard-view-tab ${
                activeTab === "tendencias" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("tendencias")}
            >
              Tendencias y patrimonio
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "compromisos"}
              className={`dashboard-view-tab ${
                activeTab === "compromisos" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("compromisos")}
            >
              Tarjetas y deudas compartidas
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "ia"}
              className={`dashboard-view-tab ${
                activeTab === "ia" ? "is-active" : ""
              }`}
              onClick={() => setActiveTab("ia")}
            >
              Lectura con IA
            </button>
          </div>
        </div>

        {activeTab === "actividad" && (
          <div className="dashboard-activity-grid" role="tabpanel">
            <section
              className="app-surface dashboard-recent"
              aria-labelledby="recent-heading"
            >
              <div className="app-section-heading">
                <div>
                  <span className="dashboard-panel-kicker">
                    Registro reciente
                  </span>
                  <h2 id="recent-heading" className="app-section-title">
                    Últimos movimientos
                  </h2>
                </div>
                <Link to="/transactions" className="app-text-link">
                  Ver todos
                </Link>
              </div>
              {recentTransactions.length ? (
                <ul className="dashboard-recent-list">
                  {recentTransactions.map((transaction) => {
                    const isIncome = transaction.transaction_type === "income";
                    const categoryName = transaction.category_id
                      ? categoryMap.get(transaction.category_id)
                      : undefined;
                    return (
                      <li key={transaction.id}>
                        <div className="dashboard-recent-item-main">
                          <span
                            className={`dashboard-recent-icon ${
                              isIncome ? "is-income" : "is-expense"
                            }`}
                            aria-hidden="true"
                          >
                            {isIncome ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <div>
                            <strong>
                              {transaction.description || "Sin descripción"}
                            </strong>
                            <div className="dashboard-recent-meta">
                              <time dateTime={transaction.date}>
                                {transaction.date.slice(0, 10)}
                              </time>
                              {categoryName && (
                                <span className="dashboard-recent-cat">
                                  {categoryName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`dashboard-recent-amount ${
                            isIncome ? "text-success" : "text-primary"
                          }`}
                        >
                          {isIncome ? "+" : "−"}${" "}
                          {formatMoney(transaction.amount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : results[8].isPending ? (
                <p role="status" className="app-inline-message">
                  Cargando movimientos…
                </p>
              ) : results[8].isError ? (
                <p role="status" className="app-inline-message">
                  No se pudieron cargar los movimientos.{" "}
                  <button
                    type="button"
                    className="app-btn"
                    onClick={() => {
                      void results[8].refetch();
                    }}
                  >
                    Reintentar movimientos
                  </button>
                </p>
              ) : (
                <p className="app-inline-message">
                  Registra una transacción o importa movimientos para ver tu
                  actividad reciente.
                </p>
              )}
            </section>

            <Suspense fallback={<SkeletonCard />}>
              <ExpenseBreakdownChart
                dashboardSummary={dashboardSummary}
                expenseBreakdown={expenseBreakdown}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "tendencias" && (
          <div className="dashboard-trends-panel" role="tabpanel">
            <Suspense fallback={<p role="status">Cargando gráficos…</p>}>
              <DashboardMetricsRow
                netBalance={netBalance}
                totalStatementDue={totalStatementDue}
                totalThirdPartyDebt={totalThirdPartyDebt}
                vehicleCost={vehicleCost}
                vehicleTelemetry={vehicleTelemetry}
              />
              <div className="dashboard-chart-grid">
                <IncomeExpenseBarChart
                  hasData={!!dashboardSummary}
                  monthlyComparison={monthlyComparison}
                />
                <DailySpendingChart
                  dashboardSummary={dashboardSummary}
                  dailySpending={dailySpending}
                />
              </div>
              <NetWorthChart netWorth={netWorth} />
            </Suspense>
          </div>
        )}

        {activeTab === "compromisos" && (
          <div className="dashboard-commitments-panel" role="tabpanel">
            <CreditCardSummary statements={statements} cards={creditCards} />
            <div className="dashboard-commitments-grid">
              <IOUWidget />
              <DebtSharesWidget statements={statements} />
            </div>
          </div>
        )}

        {activeTab === "ia" && (
          <div className="dashboard-ai-panel" role="tabpanel">
            <AIInsightsSection
              insights={insights}
              aiAlerts={aiAlerts}
              aiPatterns={aiPatterns}
              isPending={insightsMutation.isPending}
              onRefresh={() => insightsMutation.mutate()}
            />
          </div>
        )}
      </section>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* WhatIf Modal */}
      <WhatIfModal
        isOpen={showWhatIfModal}
        onClose={() => setShowWhatIfModal(false)}
        transactions={transactions}
        currentNetWorth={totalBalance.toNumber()}
        monthlyIncome={
          safeToSpend?.monthly_income ||
          (dashboardSummary?.total_income
            ? dashboardSummary.total_income / 100
            : 0)
        }
        fixedExpenses={safeToSpend?.projected_fixed_expenses || 0}
        totalDebt={totalStatementDue.toNumber()}
        avgMonthlySpend={Math.max(
          0,
          totalExpenses.toNumber() / 100 -
            (safeToSpend?.projected_fixed_expenses || 0),
        )}
      />

      {/* AnomalyScanner Modal */}
      <AnimatePresence>
        {showAnomalyScanner && (
          <Modal
            onClose={() => setShowAnomalyScanner(false)}
            label={"Revisar alertas"}
          >
            <div className="w-full max-w-3xl">
              <AIAnomalyScanner
                recentTransactions={transactions}
                currentSubscriptions={subscriptions}
                categories={categories}
                goals={goals}
                onClose={() => setShowAnomalyScanner(false)}
              />
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <footer className="dashboard-footer">
        <p>
          Desarrollado con ☕ por{" "}
          <span className="text-muted">Alan Javier Mejia Alvarez</span>
        </p>
      </footer>
    </div>
  );
};

export default Dashboard;

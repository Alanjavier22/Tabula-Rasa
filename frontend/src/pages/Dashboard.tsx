import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
import Decimal from 'decimal.js-light';
import { accountsAPI, statementsAPI, metricsAPI, budgetsAPI, snapshotsAPI, alertsAPI, transactionsAPI, subscriptionsAPI as subsAPI, categoriesAPI, goalsAPI, iousAPI, maintenanceAPI } from '../services/api';
import { toDecimal, clampZero } from '../utils/money';
import Toast from '../components/Toast';
import type { Account, CreditCardStatement, SafeToSpendResponse, NetWorthResponse, VehicleTelemetryResponse, CashFlowForecastResponse, DashboardSummaryResponse, AlertsResponse, IOU, Transaction, Subscription, Category, Goal, DebtShare } from '../types';
import type { EcuadorFiscalRules } from '../services/ReportingService';
import type { AxiosError } from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  AlertTriangle,
  Calendar,
  RefreshCw,
} from 'lucide-react';

import SafeToSpendCard from '../components/dashboard/SafeToSpendCard';
import SummaryCards from '../components/dashboard/SummaryCards';
import CreditCardSummary from '../components/dashboard/CreditCardSummary';
import IOUWidget from '../components/IOUWidget';
import DebtSharesWidget from '../components/DebtSharesWidget';
import SkeletonCard from '../components/dashboard/SkeletonCard';
import { WhatIfModal } from '../components/AIAssistant/WhatIfModal';
import { AIAnomalyScanner } from '../components/AIAssistant/AIAnomalyScanner';
import { IntegrityStatus } from '../components/IntegrityStatus';
import AIInsightsSection from '../components/dashboard/AIInsightsSection';
import PaymentAlertsPanel from '../components/dashboard/PaymentAlertsPanel';
import DashboardMetricsRow from '../components/dashboard/DashboardMetricsRow';
import ExpenseBreakdownChart from '../components/dashboard/ExpenseBreakdownChart';
import IncomeExpenseBarChart from '../components/dashboard/IncomeExpenseBarChart';
import DailySpendingChart from '../components/dashboard/DailySpendingChart';
import NetWorthChart from '../components/dashboard/NetWorthChart';
import CashFlowForecastChart from '../components/dashboard/CashFlowForecastChart';

// Referencia estable para fallback de queries sin datos: `|| []` crea un array nuevo en
// cada render, lo que invalida los useMemo que dependen de él (recomputan siempre en vez
// de solo cuando cambian los datos reales).
const EMPTY_ARRAY: never[] = [];

const Dashboard = () => {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [aiAlerts, setAiAlerts] = useState<string[]>([]);
  const [aiPatterns, setAiPatterns] = useState<string[]>([]);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [forecastDays, setForecastDays] = useState(30);
  const [showWhatIfModal, setShowWhatIfModal] = useState(false);
  const [showAnomalyScanner, setShowAnomalyScanner] = useState(false);
  
  // Guards to prevent infinite loops and concurrent operations
  const isRefetchingRef = useRef(false);


  // React Query: Fetch Payment Alerts
  const { data: paymentAlerts } = useQuery<AlertsResponse>({
    queryKey: ['paymentAlerts'],
    queryFn: async () => {
      const res = await alertsAPI.getPaymentReminders(30); // 30 days ahead
      return res.data;
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // React Query: Fetch multiple metrics and data in parallel
  const results = useQueries({
    queries: [
      {
        queryKey: ['pendingIOUs'],
        queryFn: () => iousAPI.getPending().then(res => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      { 
        queryKey: ['accounts'], 
        queryFn: () => accountsAPI.getAll().then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['statements'], 
        queryFn: () => statementsAPI.getAll().then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['safeToSpend'], 
        queryFn: async () => {
          const res = await metricsAPI.getSafeToSpend();
          return res.data;
        }, 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['netWorth'], 
        queryFn: () => metricsAPI.getNetWorth().then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['vehicleTelemetry'], 
        queryFn: () => metricsAPI.getVehicleTelemetry().then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['budgets'], 
        queryFn: () => budgetsAPI.getAll().then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['cashFlowForecast', forecastDays], 
        queryFn: () => metricsAPI.getCashFlowForecast(forecastDays).then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['transactions'], 
        queryFn: () => transactionsAPI.getAll().then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['subscriptions'], 
        queryFn: () => subsAPI.getAll().then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['categories'], 
        queryFn: () => categoriesAPI.getAll().then(res => res.data), 
        staleTime: 30000, 
        refetchOnWindowFocus: false 
      },
      { 
        queryKey: ['dashboardSummary'], 
        queryFn: async () => {
          try {
            const res = await metricsAPI.getDashboardSummary();
            return res.data;
          } catch (err) {
            console.error('Dashboard summary fetch failed:', err);
            return null;
          }
        },
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ['configIVA'],
        queryFn: async () => {
          try {
            const { configAPI } = await import('../services/api');
            const { reportingService } = await import('../services/ReportingService');
            
            // Parallel fetch for all fiscal rates
            const [ivaRes, retSrcRes, retIvaRes] = await Promise.all([
              configAPI.getByKey('iva_rate'),
              configAPI.getByKey('retencion_source_rate'),
              configAPI.getByKey('retencion_iva_rate')
            ]);

            const rules: Partial<EcuadorFiscalRules> = {};
            if (ivaRes.data?.value) rules.iva_rate = parseFloat(ivaRes.data.value);
            if (retSrcRes.data?.value) rules.retencion_source_rate = parseFloat(retSrcRes.data.value);
            if (retIvaRes.data?.value) rules.retencion_iva_rate = parseFloat(retIvaRes.data.value);

            if (Object.keys(rules).length > 0) {
              reportingService.setFiscalRules(rules);
            }
            return rules;
          } catch {
            return null;
          }
        },
        staleTime: 600000, // 10 minutes cache for static config rates
        refetchOnWindowFocus: false
      },
      {
        queryKey: ['goals'],
        queryFn: () => goalsAPI.getAll().then(res => res.data),
        staleTime: 30000,
        refetchOnWindowFocus: false
      }
    ]
  });

  const pendingIOUs = (results[0].data as IOU[]) || EMPTY_ARRAY;
  const accounts = (results[1].data as Account[]) || EMPTY_ARRAY;
  const statements = (results[2].data as CreditCardStatement[]) || EMPTY_ARRAY;
  const safeToSpend = (results[3].data as unknown) as SafeToSpendResponse | undefined;
  const netWorth = results[4].data as NetWorthResponse | undefined;
  const vehicleTelemetry = results[5].data as VehicleTelemetryResponse | undefined;
  const cashFlowForecast = results[7].data as CashFlowForecastResponse | undefined;
  const transactions = (results[8].data as Transaction[]) || EMPTY_ARRAY;
  const subscriptions = (results[9].data as Subscription[]) || EMPTY_ARRAY;
  const categories = (results[10].data as Category[]) || EMPTY_ARRAY;
  const goals = (results[13].data as Goal[]) || EMPTY_ARRAY;
  const dashboardSummary = results[11].data as DashboardSummaryResponse | undefined;

  // Widgets already degrade gracefully with `|| []`/undefined fallbacks when a
  // query is still loading, so a full-page error blocker would be a step back.
  // Instead, surface a single non-blocking toast if any of the core queries
  // (accounts, transactions, summary) actually fails, so a silent empty
  // dashboard doesn't get mistaken for "no data".
  const coreDataError = results[1].isError || results[8].isError || results[11].isError;
  const coreErrorNotifiedRef = useRef(false);
  useEffect(() => {
    if (coreDataError && !coreErrorNotifiedRef.current) {
      coreErrorNotifiedRef.current = true;
      setToast({ message: 'No se pudieron cargar algunos datos del dashboard', type: 'error' });
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
      console.error('Error generating insights:', error);
      const status = error.response?.status;
      const detail = error.response?.data?.detail;
      if (status === 400) {
        setToast({
          message: detail || 'Configura tu Gemini API Key en la página de Configuración',
          type: 'warning'
        });
      } else {
        setToast({ message: 'Error generando análisis', type: 'error' });
      }
    }
  });

  const healBalancesMutation = useMutation({
    mutationFn: () => maintenanceAPI.healBalances(),
    onSuccess: () => {
      setToast({ message: 'Balances sincronizados con éxito', type: 'success' });
      // Refetch relevant data
      results[1].refetch(); // accounts
      results[11].refetch(); // summary
    },
    onError: () => {
      setToast({ message: 'Error al sincronizar balances', type: 'error' });
    }
  });

  const handleCreateSnapshot = useCallback(async () => {
    if (creatingSnapshot || isRefetchingRef.current) {
      return; // Guard: prevent concurrent calls
    }
    
    // Prudence: We usually want to close the PREVIOUS month, not the one in progress.
    const now = new Date();
    let month = now.getMonth(); // getMonth() is 0-indexed (Jan=0), so this is the previous month index.
    let year = now.getFullYear();
    
    if (month === 0) { // If it's January, previous month was December of last year
      month = 12;
      year -= 1;
    }
    
    const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(year, month - 1));
    const confirmMessage = `¿Deseas cerrar el mes de ${monthName.toUpperCase()} ${year}?\n\nSe generará un Snapshot 'CONGELADO' para tu historial patrimonial.`;
    
    if (!window.confirm(confirmMessage)) return;

    setCreatingSnapshot(true);
    isRefetchingRef.current = true;
    
    try {
      // Use the newly implemented lock: true to protect this historical record
      await snapshotsAPI.create({ month, year, lock: true });
      setToast({ message: `Mes de ${monthName} cerrado y bloqueado exitosamente`, type: 'success' });
      
      // Refresh snapshots list if it exists in results
      results[11].refetch(); // dashboardSummary
      results[13].refetch(); // goals (might be affected by net worth)
    } catch (error) {
      console.error('Error creating snapshot:', error);
      setToast({ message: 'Error al cerrar mes contable', type: 'error' });
    } finally {
      setCreatingSnapshot(false);
      isRefetchingRef.current = false;
    }
  }, [creatingSnapshot, results]);

  // Reducciones Decimal-safe memoizadas: solo se recalculan cuando accounts/statements/dashboardSummary cambian
  const totalBalance = useMemo(() => accounts
    .filter(acc => acc.account_type === 'checking' || acc.account_type === 'savings')
    .reduce((sum, acc) => sum.plus(toDecimal(acc.balance)), new Decimal(0)), [accounts]);

  // FASE 9: Obtener solo el último estado de cuenta por tarjeta para evitar duplicación histórica
  const latestStatements = useMemo(() => {
    const latestMap = new Map<string, CreditCardStatement>();
    statements.forEach(s => {
      const current = latestMap.get(s.account_id);
      if (!current || (s.year > current.year) || (s.year === current.year && s.month > current.month)) {
        latestMap.set(s.account_id, s);
      }
    });
    return Array.from(latestMap.values());
  }, [statements]);

  const totalCreditCardDebt = useMemo(() => latestStatements
    .reduce((sum, s) => sum.plus(toDecimal(s.statement_balance)), new Decimal(0)), [latestStatements]);
    
  const totalIncome = useMemo(() => toDecimal(dashboardSummary?.total_income), [dashboardSummary]);
  const totalExpenses = useMemo(() => toDecimal(dashboardSummary?.total_expenses), [dashboardSummary]);
  const netBalance = useMemo(() => totalIncome.minus(totalExpenses), [totalIncome, totalExpenses]);

  const totalStatementGross = useMemo(() => latestStatements.reduce(
    (sum, s) => sum.plus(clampZero(toDecimal(s.user_share).minus(toDecimal(s.amount_paid)))),
    new Decimal(0)
  ), [latestStatements]);

  // La deuda neta es lo que debo pagar menos lo que me deben terceros
  const totalIOUsTheyOwe = useMemo(() => {
    return (pendingIOUs || [])
      .filter((iou: IOU) => {
        const type = String(iou.iou_type || '').toLowerCase();
        return type === 'they_owe' || type.includes('they_owe');
      })
      .reduce((sum: Decimal, iou: IOU) => sum.plus(toDecimal(iou.amount)), new Decimal(0));
  }, [pendingIOUs]);

  const totalThirdPartyDebt = useMemo(() => {
    const debtSharesSum = latestStatements.reduce(
      (sum, s) => sum.plus(
        (s.debt_shares ?? []).reduce(
          (ds: Decimal, d: DebtShare) => ds.plus(d.status === 'pending' ? toDecimal(d.amount) : 0),
          new Decimal(0)
        )
      ),
      new Decimal(0)
    );
    return debtSharesSum.plus(totalIOUsTheyOwe);
  }, [latestStatements, totalIOUsTheyOwe]);

  // La deuda de tarjetas "tuya" ya está calculada en user_share (que excluye lo que deben terceros en el estado de cuenta).
  // No restamos totalThirdPartyDebt aquí porque causaría una doble resta.
  const totalStatementDue = useMemo(() => totalStatementGross, [totalStatementGross]);

  const expenseBreakdown = useMemo(() => dashboardSummary?.expense_breakdown ?? [], [dashboardSummary]);

  const dailySpending = useMemo(() => {
    const data = dashboardSummary?.daily_spending ?? [];
    // Convert from cents (strings) to dollars (numbers) for chart scaling
    return data.map((item) => ({
      ...item,
      gasto: typeof item.gasto === 'string' ? parseFloat(item.gasto) / 100 : item.gasto / 100
    }));
  }, [dashboardSummary]);

  // Income vs Expense by month - ALWAYS use live dashboard summary for the bar chart to ensure accuracy
  const monthlyComparison = useMemo(() => {
    const dashboardData = dashboardSummary?.monthly_comparison ?? [];
    // Convert from cents to dollars and strings to numbers
    return dashboardData.map((item) => ({
      ...item,
      Ingresos: typeof item.Ingresos === 'string' ? parseFloat(item.Ingresos) / 100 : item.Ingresos / 100,
      Gastos: typeof item.Gastos === 'string' ? parseFloat(item.Gastos) / 100 : item.Gastos / 100
    }));
  }, [dashboardSummary]);


  // Credit cards summary
  const creditCards = useMemo(() => accounts.filter(a => a.account_type === 'credit_card'), [accounts]);

  const vehicleCost = useMemo(() => toDecimal(dashboardSummary?.vehicle_cost), [dashboardSummary]);

  return (
    <div className="w-full relative">
      {/* SVG Gradients Definitions for Recharts */}
      <svg style={{ width: 0, height: 0, position: 'absolute' }}>
        <defs>
          <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="gradGastos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="gradGastoDiario" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradPatrimonio" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
      {/* Dynamic Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute -bottom-[10%] left-[20%] w-[30%] h-[30%] bg-emerald-600/5 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="relative z-10">
        <div className="mb-8 lg:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-1"
          >
            <div className="flex items-center gap-2 text-purple-400 text-xs font-bold tracking-widest uppercase">
              <div className="w-8 h-[1px] bg-purple-500/50"></div>
              <span>Tabula Rasa</span>
            </div>
            <h1 className="text-3xl lg:text-5xl font-black text-white tracking-tight">
              Centro de <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">Control</span>
            </h1>
            <p className="text-slate-400 text-sm lg:text-base font-medium">Tus finanzas personales, simplificadas</p>
            <div className="mt-2">
              <IntegrityStatus accounts={accounts} statements={statements} isLoading={results[1].isLoading || results[2].isLoading} />
            </div>
          </motion.div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => healBalancesMutation.mutate()}
              disabled={healBalancesMutation.isPending}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all group ${
                healBalancesMutation.isPending
                  ? 'bg-emerald-500/10 border-emerald-500/50 cursor-wait'
                  : 'bg-slate-800/50 border-slate-700/50 text-white hover:border-emerald-500/50 hover:bg-emerald-500/10'
              }`}
              title="Sincronizar y Sanar Balances"
            >
              <RefreshCw className={`w-4 h-4 text-emerald-500 ${healBalancesMutation.isPending ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
              <span className="text-sm font-semibold">{healBalancesMutation.isPending ? 'Sanando...' : 'Integridad'}</span>
            </button>
            <button
              onClick={() => setShowAnomalyScanner(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-white hover:border-yellow-500/50 hover:bg-yellow-500/10 transition-all group"
            >
              <AlertTriangle className="w-4 h-4 text-yellow-500 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold">Anomalías</span>
            </button>
            <button
              onClick={() => setShowWhatIfModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50 text-white hover:border-purple-500/50 hover:bg-purple-500/10 transition-all group"
            >
              <Sparkles className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-semibold">Simulador</span>
            </button>
            <button
              onClick={handleCreateSnapshot}
              disabled={creatingSnapshot}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:shadow-lg hover:shadow-indigo-500/20 disabled:opacity-50 transition-all group"
            >
              <Calendar className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              <span className="text-sm font-bold">{creatingSnapshot ? 'Cerrando...' : 'Cerrar Mes'}</span>
            </button>
          </div>
        </div>

        {/* Safe to Spend - Highlighted Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          {safeToSpend ? <SafeToSpendCard data={safeToSpend} /> : <SkeletonCard height="h-40" />}
        </motion.div>

        {/* Summary Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {dashboardSummary ? (
            <SummaryCards
              balance={totalBalance}
              creditCardDebt={totalCreditCardDebt}
              income={totalIncome}
              expenses={totalExpenses}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}
        </motion.div>

        <AIInsightsSection
          insights={insights}
          aiAlerts={aiAlerts}
          aiPatterns={aiPatterns}
          isPending={insightsMutation.isPending}
          onRefresh={() => insightsMutation.mutate()}
        />

      {/* Credit Card Quick Summary */}
      <CreditCardSummary statements={statements} cards={creditCards} />

      {paymentAlerts && paymentAlerts.alerts && paymentAlerts.alerts.length > 0 && (
        <PaymentAlertsPanel data={paymentAlerts} />
      )}

      {/* IOU Widget - Dinero Flotante */}
      <div className="mb-6">
        <IOUWidget />
      </div>

      <div className="mb-6">
        <DebtSharesWidget statements={statements} />
      </div>

      <DashboardMetricsRow
        netBalance={netBalance}
        totalStatementDue={totalStatementDue}
        totalThirdPartyDebt={totalThirdPartyDebt}
        vehicleCost={vehicleCost}
        vehicleTelemetry={vehicleTelemetry}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ExpenseBreakdownChart dashboardSummary={dashboardSummary} expenseBreakdown={expenseBreakdown} />
        <IncomeExpenseBarChart hasData={!!dashboardSummary} monthlyComparison={monthlyComparison} />
      </div>

      <DailySpendingChart dashboardSummary={dashboardSummary} dailySpending={dailySpending} />
      <NetWorthChart netWorth={netWorth} />
      <CashFlowForecastChart cashFlowForecast={cashFlowForecast} forecastDays={forecastDays} setForecastDays={setForecastDays} />
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
        monthlyIncome={safeToSpend?.monthly_income || (dashboardSummary?.total_income ? dashboardSummary.total_income / 100 : 0)}
        fixedExpenses={safeToSpend?.projected_fixed_expenses || 0}
        totalDebt={totalStatementDue.toNumber()}
        avgMonthlySpend={Math.max(0, (totalExpenses.toNumber() / 100) - (safeToSpend?.projected_fixed_expenses || 0))}
      />

      {/* AnomalyScanner Modal */}
      <AnimatePresence>
        {showAnomalyScanner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ willChange: 'opacity, backdrop-filter' }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
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
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="fixed bottom-4 right-6 opacity-30 hover:opacity-100 transition-opacity duration-700">
        <p className="text-slate-500 text-[9px] uppercase tracking-[0.2em] font-medium">
          Desarrollado con ☕ por <span className="text-slate-300">Alan Javier Mejia Alvarez</span>
        </p>
      </footer>
    </div>
  </div>
);
};

export default Dashboard;

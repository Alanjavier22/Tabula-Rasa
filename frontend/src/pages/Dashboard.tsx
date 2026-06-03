import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
import Decimal from 'decimal.js-light';
import { accountsAPI, statementsAPI, metricsAPI, budgetsAPI, snapshotsAPI, alertsAPI, transactionsAPI, subscriptionsAPI as subsAPI, categoriesAPI, goalsAPI, iousAPI, maintenanceAPI } from '../services/api';
import { formatMoney, toDecimal, clampZero } from '../utils/money';
import Toast from '../components/Toast';
import type { Account, CreditCardStatement, SafeToSpendResponse, NetWorthResponse, VehicleTelemetryResponse, CashFlowForecastResponse, DashboardSummaryResponse, AlertsResponse } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, 
  AlertCircle, 
  AlertTriangle, 
  CreditCard, 
  Calendar, 
  Bell, 
  Loader2, 
  RefreshCw, 
  TrendingUp, 
} from 'lucide-react';

import SafeToSpendCard from '../components/dashboard/SafeToSpendCard';
import SummaryCards from '../components/dashboard/SummaryCards';
import CreditCardSummary from '../components/dashboard/CreditCardSummary';
import IOUWidget from '../components/IOUWidget';
import DebtSharesWidget from '../components/DebtSharesWidget';
import SkeletonCard from '../components/dashboard/SkeletonCard';
import SkeletonChart from '../components/dashboard/SkeletonChart';
import { WhatIfModal } from '../components/AIAssistant/WhatIfModal';
import { AIAnomalyScanner } from '../components/AIAssistant/AIAnomalyScanner';
import { IntegrityStatus } from '../components/IntegrityStatus';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, LineChart, Line, ReferenceLine,
  PieChart, Pie,
} from 'recharts';

const COLORS = [
  '#a855f7', // Purple
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#6366f1'  // Indigo
];

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

            const rules: any = {};
            if (ivaRes.data?.value) rules.iva_rate = parseFloat(ivaRes.data.value);
            if (retSrcRes.data?.value) rules.retencion_source_rate = parseFloat(retSrcRes.data.value);
            if (retIvaRes.data?.value) rules.retencion_iva_rate = parseFloat(retIvaRes.data.value);

            if (Object.keys(rules).length > 0) {
              reportingService.setFiscalRules(rules);
            }
            return rules;
          } catch (err) {
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

  const pendingIOUs = (results[0].data as any[]) || [];
  const accounts = (results[1].data as Account[]) || [];
  const statements = (results[2].data as CreditCardStatement[]) || [];
  const safeToSpend = (results[3].data as unknown) as SafeToSpendResponse | undefined;
  const netWorth = results[4].data as NetWorthResponse | undefined;
  const vehicleTelemetry = results[5].data as VehicleTelemetryResponse | undefined;
  const cashFlowForecast = results[7].data as CashFlowForecastResponse | undefined;
  const transactions = (results[8].data as any[]) || [];
  const subscriptions = (results[9].data as any[]) || [];
  const categories = (results[10].data as any[]) || [];
  const goals = (results[13].data as any[]) || [];
  const dashboardSummary = results[11].data as DashboardSummaryResponse | undefined;

  const insightsMutation = useMutation({
    mutationFn: () => metricsAPI.getInsights(),
    onSuccess: (response) => {
      setInsights(response.data.insights);
      setAiAlerts(response.data.alerts ?? []);
      setAiPatterns(response.data.patterns ?? []);
    },
    onError: (error: any) => {
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
      .filter((iou: any) => {
        const type = String(iou.iou_type || '').toLowerCase();
        return type === 'they_owe' || type.includes('they_owe');
      })
      .reduce((sum: Decimal, iou: any) => sum.plus(toDecimal(iou.amount)), new Decimal(0));
  }, [pendingIOUs]);

  const totalThirdPartyDebt = useMemo(() => {
    const debtSharesSum = latestStatements.reduce(
      (sum, s) => sum.plus(
        (s.debt_shares ?? []).reduce(
          (ds: Decimal, d: any) => ds.plus(d.status === 'pending' ? toDecimal(d.amount) : 0),
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
    return data.map((item: any) => ({
      ...item,
      gasto: typeof item.gasto === 'string' ? parseFloat(item.gasto) / 100 : item.gasto / 100
    }));
  }, [dashboardSummary]);

  // Income vs Expense by month - ALWAYS use live dashboard summary for the bar chart to ensure accuracy
  const monthlyComparison = useMemo(() => {
    const dashboardData = dashboardSummary?.monthly_comparison ?? [];
    // Convert from cents to dollars and strings to numbers
    return dashboardData.map((item: any) => ({
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

        {/* AI Insights Section Overhaul */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              Insights Estratégicos
            </h2>
            <button
              onClick={() => insightsMutation.mutate()}
              disabled={insightsMutation.isPending}
              className={`flex items-center gap-2 px-5 py-2 rounded-full text-white text-sm font-bold transition-all border ${
                insightsMutation.isPending
                  ? 'bg-slate-800 border-slate-700 opacity-70 animate-pulse'
                  : 'bg-slate-900/50 border-purple-500/50 hover:bg-purple-500/10 hover:border-purple-400'
              }`}
            >
              {insightsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              ) : (
                <RefreshCw className="w-4 h-4 text-purple-400" />
              )}
              {insightsMutation.isPending ? 'Consultando IA...' : 'Refrescar Análisis'}
            </button>
          </div>

          {insights ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {insights.map((insight, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="group bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-5 hover:border-purple-500/30 transition-all hover:bg-slate-800/50 shadow-lg"
                  >
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 text-sm font-bold border border-purple-500/20 group-hover:bg-purple-500/20 transition-all">
                        {index + 1}
                      </div>
                      <p className="text-slate-200 text-sm leading-relaxed">{insight}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Anomaly & Patterns merged as cards */}
              {aiAlerts.map((alert, i) => (
                <motion.div
                  key={`alert-${i}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-500/5 backdrop-blur-xl rounded-2xl border border-red-500/20 p-5"
                >
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-red-400 text-xs font-bold uppercase tracking-wider mb-1">Riesgo Detectado</h4>
                      <p className="text-red-200 text-sm leading-relaxed">{alert}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
              
              {aiPatterns.map((pattern, i) => (
                <motion.div
                  key={`pattern-${i}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-amber-500/5 backdrop-blur-xl rounded-2xl border border-amber-500/20 p-5"
                >
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">Patrón de Gasto</h4>
                      <p className="text-amber-200 text-sm leading-relaxed">{pattern}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : !insightsMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-800/20 rounded-3xl border border-dashed border-slate-700">
              <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-purple-400/50" />
              </div>
              <h3 className="text-white font-semibold mb-1">Análisis IA Pendiente</h3>
              <p className="text-slate-400 text-sm text-center max-w-xs">Haz clic en el botón para que la IA escanee tu situación actual y genere estrategias personalizadas.</p>
            </div>
          )}
        </div>

      {/* Credit Card Quick Summary */}
      <CreditCardSummary statements={statements} cards={creditCards} />

      {/* Payment Alerts */}
      {paymentAlerts && paymentAlerts.alerts && paymentAlerts.alerts.length > 0 && (
        <div className="mb-6">
          <div className="bg-gradient-to-r from-amber-900/30 to-red-900/30 backdrop-blur-xl rounded-2xl border border-amber-500/40 p-4 lg:p-6">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-400" />
              Alertas de Pago
              <span className="ml-auto text-sm font-normal text-amber-400">
                Pendiente total: ${formatMoney(paymentAlerts.total_pending)}
              </span>
            </h3>
            <div className="space-y-2">
              {paymentAlerts.alerts.map((alert, idx) => (
                <div
                  key={`${alert.account_id}-${alert.alert_type}-${idx}`}
                  className={`flex items-center justify-between p-3 rounded-xl ${
                    alert.severity === 'critical' ? 'bg-red-500/15 border border-red-500/30' :
                    alert.severity === 'warning' ? 'bg-amber-500/15 border border-amber-500/30' :
                    'bg-slate-700/30 border border-slate-600/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      alert.severity === 'critical' ? 'bg-red-500/20' :
                      alert.severity === 'warning' ? 'bg-amber-500/20' :
                      'bg-blue-500/20'
                    }`}>
                      {alert.alert_type === 'overdue' ? (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : alert.alert_type === 'payment_due' ? (
                        <CreditCard className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Calendar className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{alert.account_name}</p>
                      <p className="text-xs text-slate-400">
                        {alert.alert_type === 'overdue' && `Vencido hace ${Math.abs(alert.days_remaining)} días`}
                        {alert.alert_type === 'payment_due' && (
                          alert.days_remaining === 0 ? 'Vence hoy' :
                          alert.days_remaining === 1 ? 'Vence mañana' :
                          `Vence en ${alert.days_remaining} días`
                        )}
                        {alert.alert_type === 'statement_cut' && `Corte en ${alert.days_remaining} días`}
                        {alert.due_date && ` · ${alert.due_date}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold text-sm ${
                      alert.severity === 'critical' ? 'text-red-400' :
                      alert.severity === 'warning' ? 'text-amber-400' :
                      'text-slate-300'
                    }`}>
                      ${formatMoney(alert.amount_pending)}
                    </p>
                    {alert.bank_name && (
                      <p className="text-xs text-slate-500">{alert.bank_name}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}



      {/* IOU Widget - Dinero Flotante */}
      <div className="mb-6">
        <IOUWidget />
      </div>

      <div className="mb-6">
        <DebtSharesWidget statements={statements} />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
          <p className="text-slate-400 text-xs mb-1">Balance Neto (Este mes)</p>
          <p className={`text-xl font-bold ${netBalance.gte(0) ? 'text-green-400' : 'text-red-400'}`}>
            ${formatMoney(netBalance)}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
          <p className="text-slate-400 text-xs mb-1">Saldos pendientes de tarjetas (tuyo)</p>
          <p className="text-xl font-bold text-orange-400">${formatMoney(totalStatementDue)}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
          <p className="text-slate-400 text-xs mb-1">Te deben terceros</p>
          <p className="text-xl font-bold text-yellow-400">${formatMoney(totalThirdPartyDebt)}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-purple-500/50 p-4 text-center">
          <p className="text-slate-400 text-xs mb-1">🚗 Costo Vehículo</p>
          <p className="text-xl font-bold text-purple-400">${formatMoney(vehicleCost)}</p>
          {vehicleTelemetry && (
            <div className="mt-2 space-y-1">
              {vehicleTelemetry.total_distance > 0 ? (
                <p className="text-[10px] text-slate-400">
                  ${formatMoney(vehicleTelemetry.cost_per_km)}/km | Hist: ${formatMoney(vehicleTelemetry.historical_cost_per_km)}/km
                </p>
              ) : vehicleTelemetry.total_vehicle_cost > 0 ? (
                <p className="text-[10px] text-slate-500">Requiere +1 lectura de odómetro</p>
              ) : null}
              
              {vehicleTelemetry.next_maintenance_estimate !== null && (
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                  vehicleTelemetry.next_maintenance_estimate < 500 ? 'bg-red-500/20 text-red-400' : 
                  vehicleTelemetry.next_maintenance_estimate < 1000 ? 'bg-amber-500/20 text-amber-400' : 
                  'bg-emerald-500/20 text-emerald-400'
                }`}>
                  Mantenimiento en: {Math.round(vehicleTelemetry.next_maintenance_estimate)} km
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Expense Breakdown Pie */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Distribución de Gastos</h3>
          {dashboardSummary ? (
            expenseBreakdown.length > 0 ? (
              <div className="flex flex-col gap-4">
                <div className="flex-1 min-w-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <Pie
                        data={expenseBreakdown.map((item: any, i: number) => ({
                          ...item,
                          value: typeof item.value === 'string' ? parseFloat(item.value) : item.value,
                          fill: COLORS[i % COLORS.length]
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={90}
                        dataKey="value"
                        stroke="none"
                        label={false}
                        nameKey="name"
                        cornerRadius={6}
                        paddingAngle={5}
                      />
                        <Tooltip
                          contentStyle={{ 
                            background: 'rgba(15, 23, 42, 0.8)', 
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(148, 163, 184, 0.1)', 
                            borderRadius: '12px', 
                            color: '#fff',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                          }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(value: any, name: any) => {
                            const total = expenseBreakdown.reduce((sum: number, item: any) => {
                              const val = typeof item.value === 'string' ? parseFloat(item.value) : item.value;
                              return sum + (isNaN(val) ? 0 : val);
                            }, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return [`$${formatMoney(value)} (${percentage}%)`, name];
                          }}
                        />
                      </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-xs max-h-[250px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-2">
                    {expenseBreakdown.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-300 truncate flex-1" title={item.name}>{item.name}</span>
                        <span className="text-slate-400 font-medium flex-shrink-0">${formatMoney(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">Sin datos</p>
            )
          ) : (
            <SkeletonChart height="h-56" />
          )}
        </div>

        {/* Income vs Expenses Bar */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Histórico de Ingresos vs Gastos</h3>
          {dashboardSummary && monthlyComparison.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyComparison} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" vertical={false} />
                <XAxis 
                  dataKey="mes" 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(value: string) => {
                    const [year, month] = value.split('-');
                    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    const monthIndex = parseInt(month) - 1;
                    return `${monthNames[monthIndex]} de ${year}`;
                  }}
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ 
                    background: 'rgba(15, 23, 42, 0.8)', 
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(148, 163, 184, 0.1)', 
                    borderRadius: '12px', 
                    color: '#fff',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                  cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }}
                  labelFormatter={(label: any) => {
                    if (typeof label !== 'string') return '';
                    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    const [year, month] = label.split('-');
                    const monthIndex = parseInt(month) - 1;
                    return `${monthNames[monthIndex]} de ${year}`;
                  }}
                  formatter={(value: any, name: any) => [`$${value.toLocaleString()}`, name]}
                />
                <Bar dataKey="Ingresos" fill="url(#gradIngresos)" radius={[10, 10, 0, 0]} barSize={12} />
                <Bar dataKey="Gastos" fill="url(#gradGastos)" radius={[10, 10, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-center py-8">Sin datos</p>
          )}
        </div>
      </div>

      {/* Daily Spending Area Chart */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Gasto Diario</h3>
        {dashboardSummary && dailySpending.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailySpending}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(value: string) => {
                  const [month, day] = value.split('-');
                  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                  const monthIndex = parseInt(month) - 1;
                  const dayNum = parseInt(day);
                  return `${dayNum} de ${monthNames[monthIndex]}`;
                }}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={(value: any) => `$${value.toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{ 
                  background: 'rgba(15, 23, 42, 0.8)', 
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(148, 163, 184, 0.1)', 
                  borderRadius: '12px', 
                  color: '#fff',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                }}
                labelFormatter={(label: any) => {
                  if (typeof label !== 'string') return '';
                  const [month, day] = label.split('-');
                  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                  const monthIndex = parseInt(month) - 1;
                  const dayNum = parseInt(day);
                  return `${dayNum} de ${monthNames[monthIndex]}`;
                }}
                formatter={(value: any) => [`$${value.toLocaleString()}`, 'Gasto']}
              />
              <Area type="monotone" dataKey="gasto" stroke="#a855f7" fill="url(#gradGastoDiario)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        ) : dashboardSummary ? (
          <p className="text-slate-500 text-center py-8">Sin datos</p>
        ) : (
          <SkeletonChart height="h-56" />
        )}
      </div>

      {/* Net Worth Line Chart */}
      {netWorth ? (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Patrimonio Neto</h3>
            <div className="text-right">
              <p className="text-xs text-slate-400">Activos: ${formatMoney(netWorth.assets)}</p>
              <p className="text-xs text-slate-400">Pasivos: ${formatMoney(netWorth.liabilities)}</p>
              <p className={`text-sm font-bold ${toDecimal(netWorth.net_worth).gte(0) ? 'text-green-400' : 'text-red-400'}`}>
                Patrimonio Neto: ${formatMoney(netWorth.net_worth)}
              </p>
            </div>
          </div>
          {(netWorth.history ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={netWorth.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(value: string) => {
                    const [year, month] = value.split('-');
                    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    const monthIndex = parseInt(month) - 1;
                    return `${monthNames[monthIndex]} de ${year}`;
                  }}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(value: any) => `$${(value / 100).toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{ 
                    background: 'rgba(15, 23, 42, 0.8)', 
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(148, 163, 184, 0.1)', 
                    borderRadius: '12px', 
                    color: '#fff',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                  labelFormatter={(label: any) => {
                    if (typeof label !== 'string') return '';
                    const [year, month] = label.split('-');
                    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    const monthIndex = parseInt(month) - 1;
                    return `${monthNames[monthIndex]} de ${year}`;
                  }}
                  formatter={(value: any, name: any) => [`$${formatMoney(value)}`, name ?? '']}
                />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} name="Ingresos" dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} name="Gastos" dot={{ r: 4, fill: '#ef4444' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-center py-8">Sin datos históricos</p>
          )}
        </div>
      ) : (
        <SkeletonChart height="h-56" />
      )}





      {/* Cash Flow Forecast */}
      {cashFlowForecast ? (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-white">Proyección de Liquidez</h3>
            <div className="flex items-center gap-2">
              {[30, 60, 90].map(days => (
                <button
                  key={days}
                  onClick={() => setForecastDays(days)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                    forecastDays === days
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white'
                  }`}
                >
                  {days}d
                </button>
              ))}
              {cashFlowForecast.has_negative_balance && (
                <div className="flex items-center gap-2 text-red-400 text-sm font-bold ml-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="hidden sm:inline">Riesgo de Liquidez</span>
                </div>
              )}
            </div>
          </div>
          {cashFlowForecast.forecast && cashFlowForecast.forecast.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={cashFlowForecast.forecast}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={(value: string) => {
                    const parts = value.split('-');
                    const month = parts[1];
                    const day = parts[2];
                    return `${day}-${month}`;
                  }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={(value: any) => `$${(value / 100).toLocaleString()}`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                  itemStyle={{ color: '#f1f5f9' }}
                  labelFormatter={(label: any) => {
                    if (typeof label !== 'string') return '';
                    const [year, month, day] = label.split('-');
                    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                    const monthIndex = parseInt(month) - 1;
                    const dayNum = parseInt(day);
                    return `${dayNum} de ${monthNames[monthIndex].toLowerCase()} de ${year}`;
                  }}
                  formatter={(value: any) => [`$${formatMoney(value)}`, 'Balance Proyectado']}
                />
                <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" />
                <Area
                  type="monotone"
                  dataKey="projected_balance"
                  name="Balance Proyectado"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorBalance)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-center py-8">Sin datos de proyección</p>
          )}
        </div>
      ) : (
        <SkeletonChart height="h-64" />
      )}





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
        apiKey={localStorage.getItem('GOOGLE_API_KEY') || ''}
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
                apiKey={localStorage.getItem('GOOGLE_API_KEY') || ''}
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

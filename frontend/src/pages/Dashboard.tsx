import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueries, useMutation } from '@tanstack/react-query';
import Decimal from 'decimal.js-light';
import { accountsAPI, statementsAPI, metricsAPI, budgetsAPI, snapshotsAPI } from '../services/api';
import { formatMoney, toDecimal, clampZero } from '../utils/money';
import type { Account, CreditCardStatement, SafeToSpendResponse, NetWorthResponse, VehicleTelemetryResponse, CashFlowForecastResponse, Budget, DashboardSummaryResponse } from '../types';
import {
  Wallet,
  Sparkles,
  AlertCircle,
  CreditCard,
  Calendar
} from 'lucide-react';
import Toast from '../components/Toast';
import SafeToSpendCard from '../components/dashboard/SafeToSpendCard';
import SummaryCards from '../components/dashboard/SummaryCards';
import CreditCardSummary from '../components/dashboard/CreditCardSummary';
import IOUWidget from '../components/IOUWidget';
import SkeletonCard from '../components/dashboard/SkeletonCard';
import SkeletonChart from '../components/dashboard/SkeletonChart';
import SkeletonRow from '../components/dashboard/SkeletonRow';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, LineChart, Line, ReferenceLine, Sankey,
} from 'recharts';

const COLORS = ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'];

const Dashboard = () => {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [aiAlerts, setAiAlerts] = useState<string[]>([]);
  const [aiPatterns, setAiPatterns] = useState<string[]>([]);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  
  // Guards to prevent infinite loops and concurrent operations
  const isRefetchingRef = useRef(false);

  // React Query: Fetch Snapshots
  const { data: snapshots = [], refetch: refetchSnapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: async () => {
      const res = await snapshotsAPI.getAll();
      return res.data;
    }
  });

  // React Query: Fetch multiple metrics and data in parallel
  const results = useQueries({
    queries: [
      { queryKey: ['accounts'], queryFn: () => accountsAPI.getAll().then(res => res.data) },
      { queryKey: ['statements'], queryFn: () => statementsAPI.getAll().then(res => res.data) },
      { queryKey: ['safeToSpend'], queryFn: async () => {
        const res = await metricsAPI.getSafeToSpend();
        return res.data;
      }},
      { queryKey: ['netWorth'], queryFn: () => metricsAPI.getNetWorth().then(res => res.data) },
      { queryKey: ['vehicleTelemetry'], queryFn: () => metricsAPI.getVehicleTelemetry().then(res => res.data) },
      { queryKey: ['budgets'], queryFn: () => budgetsAPI.getAll().then(res => res.data) },
      { queryKey: ['cashFlowForecast'], queryFn: () => metricsAPI.getCashFlowForecast().then(res => res.data) },
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
        }
      },
    ]
  });

  const accounts = (results[0].data as Account[]) || [];
  const statements = (results[1].data as CreditCardStatement[]) || [];
  const safeToSpend = (results[2].data as unknown) as SafeToSpendResponse | undefined;
  const netWorth = results[3].data as NetWorthResponse | undefined;
  const vehicleTelemetry = results[4].data as VehicleTelemetryResponse | undefined;
  const budgets = (results[5].data as Budget[]) || [];
  const cashFlowForecast = results[6].data as CashFlowForecastResponse | undefined;
  const dashboardSummary = results[7].data as DashboardSummaryResponse | undefined;



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
      } else if (status === 503) {
        setToast({
          message: detail || 'Servicio de IA temporalmente no disponible. Intenta en unos minutos.',
          type: 'warning'
        });
      } else if (status === 429) {
        setToast({
          message: 'Cuota de IA excedida. Intenta nuevamente más tarde.',
          type: 'error'
        });
      } else {
        setToast({
          message: detail || 'Error al generar análisis IA. Intenta nuevamente.',
          type: 'error'
        });
      }
    }
  });

  const handleCreateSnapshot = useCallback(async () => {
    if (creatingSnapshot || isRefetchingRef.current) {
      return; // Guard: prevent concurrent calls
    }
    
    setCreatingSnapshot(true);
    isRefetchingRef.current = true;
    
    try {
      const now = new Date();
      const month = now.getMonth() + 1; // 1-12
      const year = now.getFullYear();
      
      await snapshotsAPI.create({ month, year });
      setToast({ message: 'Mes contable cerrado exitosamente', type: 'success' });
      
      refetchSnapshots();
    } catch (error) {
      console.error('Error creating snapshot:', error);
      setToast({ message: 'Error al cerrar mes contable', type: 'error' });
    } finally {
      setCreatingSnapshot(false);
      isRefetchingRef.current = false;
    }
  }, [creatingSnapshot, refetchSnapshots]);

  // Reducciones Decimal-safe memoizadas: solo se recalculan cuando accounts/statements/dashboardSummary cambian
  const totalBalance = useMemo(() => accounts
    .filter(acc => acc.account_type === 'checking' || acc.account_type === 'savings')
    .reduce((sum, acc) => sum.plus(toDecimal(acc.balance)), new Decimal(0)), [accounts]);
  const totalCreditCardDebt = useMemo(() => accounts
    .filter(acc => acc.account_type === 'credit_card')
    .reduce((sum, acc) => sum.plus(toDecimal(acc.balance)), new Decimal(0)), [accounts]);
  const totalIncome = useMemo(() => toDecimal(dashboardSummary?.total_income), [dashboardSummary]);
  const totalExpenses = useMemo(() => toDecimal(dashboardSummary?.total_expenses), [dashboardSummary]);
  const netBalance = useMemo(() => totalIncome.minus(totalExpenses), [totalIncome, totalExpenses]);

  const totalStatementDue = useMemo(() => statements.reduce(
    (sum, s) => sum.plus(clampZero(toDecimal(s.user_share).minus(toDecimal(s.amount_paid)))),
    new Decimal(0)
  ), [statements]);
  const totalThirdPartyDebt = useMemo(() => statements.reduce(
    (sum, s) => sum.plus(
      (s.debt_shares ?? []).reduce(
        (ds: Decimal, d: any) => ds.plus(d.status === 'pending' ? toDecimal(d.amount) : 0),
        new Decimal(0)
      )
    ),
    new Decimal(0)
  ), [statements]);

  const expenseBreakdown = useMemo(() => dashboardSummary?.expense_breakdown ?? [], [dashboardSummary]);

  const dailySpending = useMemo(() => dashboardSummary?.daily_spending ?? [], [dashboardSummary]);

  // Income vs Expense by month - use snapshots if available, otherwise use dashboard summary
  const monthlyComparison = useMemo(() => {
    if (snapshots.length > 0) {
      return [...snapshots]
        .sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        })
        .map(snap => ({
          mes: `${snap.year}-${String(snap.month).padStart(2, '0')}`,
          Ingresos: toDecimal(snap.total_assets).toNumber(),
          Gastos: toDecimal(snap.total_liabilities).toNumber(),
        }));
    }
    return dashboardSummary?.monthly_comparison ?? [];
  }, [snapshots, dashboardSummary]);

  const sankeyData = useMemo(() => dashboardSummary?.sankey_data ?? { nodes: [], links: [] }, [dashboardSummary]);

  // Credit cards summary
  const creditCards = useMemo(() => accounts.filter(a => a.account_type === 'credit_card'), [accounts]);

  const vehicleCost = useMemo(() => toDecimal(dashboardSummary?.vehicle_cost), [dashboardSummary]);

  return (
    <div className="w-full">
      <div className="mb-6 lg:mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-4xl font-bold text-white mb-2">Panel Principal</h1>
          <p className="text-slate-300 text-sm lg:text-base">Resumen de tus finanzas</p>
        </div>
        <button
          onClick={handleCreateSnapshot}
          disabled={creatingSnapshot}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-700 hover:to-orange-700 text-sm disabled:opacity-50 transition-all"
        >
          <Calendar className="w-4 h-4" />
          {creatingSnapshot ? 'Cerrando...' : 'Cerrar Mes Contable'}
        </button>
      </div>

      {/* Safe to Spend - Highlighted Card */}
      {safeToSpend ? <SafeToSpendCard data={safeToSpend} /> : <SkeletonCard height="h-40" />}

      {/* Summary Cards */}
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

      {/* AI Insights Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Análisis IA
          </h2>
          <button
            onClick={() => insightsMutation.mutate()}
            disabled={insightsMutation.isPending}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm transition-all ${
              insightsMutation.isPending
                ? 'bg-purple-800 opacity-70 cursor-not-allowed animate-pulse'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
            }`}
          >
            {insightsMutation.isPending ? (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {insightsMutation.isPending ? 'Analizando con IA...' : 'Generar Análisis'}
          </button>
        </div>

        {insights && (
          <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 backdrop-blur-xl rounded-2xl border border-purple-500/50 p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10 animate-pulse"></div>
            <div className="relative z-10">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Consejos Financieros IA
              </h3>
              <ul className="space-y-3">
                {insights.map((insight, index) => (
                  <li key={index} className="flex items-start gap-3 text-slate-200">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300 text-sm font-medium">
                      {index + 1}
                    </span>
                    <span className="text-sm">{insight}</span>
                  </li>
                ))}
              </ul>
              {aiAlerts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-red-500/30">
                  <h4 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> Alertas de Riesgo
                  </h4>
                  <ul className="space-y-2">
                    {aiAlerts.map((alert, i) => (
                      <li key={i} className="text-sm text-red-300 flex items-start gap-2">
                        <span className="text-red-500 mt-0.5">•</span>
                        {alert}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aiPatterns.length > 0 && (
                <div className="mt-4 pt-4 border-t border-amber-500/30">
                  <h4 className="text-sm font-semibold text-amber-400 mb-2">Patrones Detectados</h4>
                  <ul className="space-y-2">
                    {aiPatterns.map((pattern, i) => (
                      <li key={i} className="text-sm text-amber-300 flex items-start gap-2">
                        <span className="text-amber-500 mt-0.5">•</span>
                        {pattern}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Credit Card Quick Summary */}
      <CreditCardSummary statements={statements} cards={creditCards} />

      {/* IOU Widget - Dinero Flotante */}
      <div className="mb-6">
        <IOUWidget />
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
          <p className="text-slate-400 text-xs mb-1">Balance Neto</p>
          <p className={`text-xl font-bold ${netBalance.gte(0) ? 'text-green-400' : 'text-red-400'}`}>
            ${formatMoney(netBalance)}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
          <p className="text-slate-400 text-xs mb-1">Pendiente Cortes (tuyo)</p>
          <p className="text-xl font-bold text-orange-400">${formatMoney(totalStatementDue)}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
          <p className="text-slate-400 text-xs mb-1">Te deben terceros</p>
          <p className="text-xl font-bold text-yellow-400">${formatMoney(totalThirdPartyDebt)}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-purple-500/50 p-4 text-center">
          <p className="text-slate-400 text-xs mb-1">🚗 Costo Vehículo</p>
          <p className="text-xl font-bold text-purple-400">${formatMoney(vehicleCost)}</p>
          {vehicleTelemetry && vehicleTelemetry.total_distance > 0 ? (
            <p className="text-xs text-slate-400 mt-1">
              ${formatMoney(vehicleTelemetry.cost_per_km)}/km | {formatMoney(vehicleTelemetry.total_distance, 0)} km
            </p>
          ) : vehicleTelemetry && vehicleTelemetry.total_vehicle_cost > 0 ? (
            <p className="text-xs text-slate-500 mt-1">Requiere 2 cargas para medir KM</p>
          ) : null}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Expense Breakdown Pie */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Top Gastos</h3>
          {dashboardSummary ? (
            expenseBreakdown.length > 0 ? (
              <div className="flex flex-col lg:flex-row items-center gap-4">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={expenseBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                    >
                      {expenseBreakdown.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                      formatter={(value: any) => [`$${formatMoney(value)}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 text-xs w-full lg:w-auto">
                  {expenseBreakdown.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-300 truncate max-w-[140px]">{item.name}</span>
                      <span className="text-slate-400 ml-auto">${formatMoney(item.value)}</span>
                    </div>
                  ))}
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
          <h3 className="text-lg font-semibold text-white mb-4">Ingresos vs Gastos</h3>
          {dashboardSummary && monthlyComparison.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                  formatter={(value: any) => [`$${formatMoney(value)}`, '']}
                />
                <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
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
              <defs>
                <linearGradient id="gradGasto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                formatter={(value: any) => [`$${formatMoney(value)}`, 'Gasto']}
              />
              <Area type="monotone" dataKey="gasto" stroke="#8b5cf6" fill="url(#gradGasto)" strokeWidth={2} />
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
            <h3 className="text-lg font-semibold text-white">Patrimonio Neto (Net Worth)</h3>
            <div className="text-right">
              <p className="text-xs text-slate-400">Assets: ${formatMoney(netWorth.assets)}</p>
              <p className="text-xs text-slate-400">Liabilities: ${formatMoney(netWorth.liabilities)}</p>
              <p className={`text-sm font-bold ${toDecimal(netWorth.net_worth).gte(0) ? 'text-green-400' : 'text-red-400'}`}>
                Net Worth: ${formatMoney(netWorth.net_worth)}
              </p>
            </div>
          </div>
          {(netWorth.history ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={netWorth.history}>
                <defs>
                  <linearGradient id="gradNetWorth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                  formatter={(value: any, name: any) => [`$${formatMoney(value)}`, name ?? '']}
                />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} name="Ingresos" />
                <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} name="Gastos" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-slate-500 text-center py-8">Sin datos históricos</p>
          )}
        </div>
      ) : (
        <SkeletonChart height="h-56" />
      )}

      {/* Sankey Diagram: Money Flow */}
      <div className="col-span-1 lg:col-span-2 bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Flujo de Dinero (Este Mes)</h3>
          <p className="text-xs text-slate-400 border border-slate-600 px-2 py-1 rounded-md">Poder Visual</p>
        </div>
        {dashboardSummary && sankeyData.nodes.length > 1 && sankeyData.links.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <Sankey
              data={sankeyData}
              node={{ fill: '#8b5cf6' }}
              nodePadding={50}
              margin={{ left: 20, right: 20, top: 20, bottom: 20 }}
              link={{ stroke: '#94a3b8', strokeOpacity: 0.2 }}
            >
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                formatter={(value: any, name: any) => [`$${formatMoney(value)}`, name ?? '']}
              />
            </Sankey>
          </ResponsiveContainer>
        ) : dashboardSummary ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-60">
            <PieChart className="w-12 h-12 text-slate-500 mb-2" />
            <p className="text-slate-400 text-sm">Registra ingresos y gastos este mes para ver el flujo de tu dinero.</p>
          </div>
        ) : (
          <SkeletonChart height="h-72" />
        )}
      </div>

      {/* Budget Variance Section */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 mb-6">
        <h3 className="text-lg font-semibold text-white mb-4">Presupuestos</h3>
        {budgets.length > 0 ? (
          <div className="space-y-3">
            {budgets.map((budget: any) => {
              const budgetAmount = toDecimal(budget.amount);
              const budgetSpent = toDecimal(budget.spent);
              const percentage = budgetAmount.isZero() ? 0 : budgetSpent.div(budgetAmount).times(100).toNumber();
              const isOverBudget = percentage > 100;

              // Backend provides these pre-calculated pacing fields!
              const monthProgress = budget.month_progress_percentage || 0;
              const isOverPacing = budget.is_over_pacing || false;
              const remaining = budget.remaining ?? budgetAmount.minus(budgetSpent);

              return (
                <div key={budget.id}>
                  <div className="flex justify-between mb-1 text-sm">
                    <span className="text-white">{budget.name}</span>
                    <span className="text-slate-300">${formatMoney(budget.spent)} / ${formatMoney(budget.amount)}</span>
                  </div>
                  <div className="relative w-full bg-slate-700 rounded-full h-4 overflow-hidden">
                    {/* Marcador de tiempo ideal (Línea) */}
                    {monthProgress > 0 && monthProgress < 100 && (
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-slate-300 z-10 border-r border-slate-800"
                        style={{ left: `${monthProgress}%` }}
                      />
                    )}
                    <div
                      className={`h-4 transition-all duration-500 ${
                        isOverBudget ? 'bg-gradient-to-r from-red-600 to-red-400' :
                        isOverPacing ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                        'bg-gradient-to-r from-green-600 to-green-400'
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs">
                    <span className={isOverBudget ? 'text-red-400 font-bold' : 'text-slate-400'}>{percentage.toFixed(0)}%</span>
                    <span className={isOverBudget ? 'text-red-400 font-bold' : isOverPacing ? 'text-orange-400 font-bold' : 'text-slate-400'}>
                      {isOverBudget ? '⚠️ Presupuesto Excedido' :
                       isOverPacing ? '⚠️ Proyección de exceso a fin de mes' :
                       `$${formatMoney(remaining)} restante`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-8">Sin presupuestos configurados</p>
        )}
      </div>

      {/* Cash Flow Forecast */}
      {cashFlowForecast ? (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Proyección de Liquidez a 30 Días</h3>
            {cashFlowForecast.has_negative_balance && (
              <div className="flex items-center gap-2 text-red-400 text-sm font-bold">
                <AlertCircle className="w-5 h-5" />
                <span>Riesgo de Liquidez Detectado</span>
              </div>
            )}
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
                  tickFormatter={(value) => value.substring(5)}
                />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                  labelStyle={{ color: '#f1f5f9' }}
                  itemStyle={{ color: '#f1f5f9' }}
                />
                <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" />
                <Area
                  type="monotone"
                  dataKey="projected_balance"
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

      {/* Account Summary */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Resumen Cuentas</h3>
        <div className="space-y-3">
          {accounts.length > 0 ? accounts.map(acc => (
            <div key={acc.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${acc.account_type === 'credit_card' ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                  {acc.account_type === 'credit_card' ? <CreditCard className="w-4 h-4 text-red-400" /> : <Wallet className="w-4 h-4 text-blue-400" />}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{acc.name}</p>
                  {acc.bank_name && <p className="text-xs text-slate-500">{acc.bank_name}</p>}
                </div>
              </div>
              <p className={`font-bold ${toDecimal(acc.balance).lt(0) ? 'text-red-400' : 'text-white'}`}>
                ${formatMoney(acc.balance)}
              </p>
            </div>
          )) : (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}
        </div>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;

/**
 * FiscalDashboard - FASE 3: Analytics Layer for Tabula Rasa
 * FASE 4: Added SRI Annex export with progress tracking
 * Visualizes fiscal data using Recharts with performance optimizations
 * Redesigned with custom SVG gradients, Glassmorphism, and Donut-centered stats
 */

import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatMoney, toNumber } from '../../utils/money';
import { fiscalAPI } from '../../services/api';
import { Download, FileJson, FileCode, Percent, Receipt, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Chart colors - hex values for Recharts legend
const COLORS = {
  iva15: '#ef4444',
  iva0: '#10b981',
  deductible: '#8b5cf6',
  income: '#10b981',
  expense: '#ec4899',
};

interface FiscalDashboardProps {
  startDate: string;
  endDate: string;
  categoryIds?: string[];
}

interface KPICardProps {
  title: string;
  value: string;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
  glowColor: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, color, icon, glowColor }) => (
  <motion.div 
    whileHover={{ y: -5, scale: 1.02 }}
    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
    className="relative overflow-hidden bg-slate-900/60 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between h-36 group shadow-2xl transition-all duration-300"
  >
    {/* Background Glow */}
    <div 
      className="absolute -right-10 -top-10 w-24 h-24 rounded-full opacity-10 blur-2xl group-hover:scale-150 transition-all duration-500"
      style={{ backgroundColor: glowColor }}
    />
    
    <div className="flex justify-between items-start">
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</h3>
        <p className="text-3xl font-black tracking-tight" style={{ color }}>{value}</p>
      </div>
      <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 group-hover:text-white group-hover:bg-white/10 transition-colors">
        {icon}
      </div>
    </div>
    <p className="text-xs text-slate-400 font-semibold mt-2">{subtitle}</p>
  </motion.div>
);

/**
 * Custom tooltip for charts with monetary formatting
 */
const CustomTooltip = ({ active, payload, label }: unknown) => {
  if (active && payload && payload.length) {
    const formattedLabel = (() => {
      if (!label) return label;
      const [year, month] = label.split('-');
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const monthIndex = parseInt(month) - 1;
      return `${monthNames[monthIndex]} de ${year}`;
    })();

    return (
      <div className="bg-slate-900/90 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-white/10">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{formattedLabel}</p>
        {payload.map((entry: unknown, index: number) => (
          <div key={index} className="flex items-center gap-2 mt-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color === 'url(#colorIncome)' ? '#10b981' : entry.color === 'url(#colorExpenses)' ? '#8b5cf6' : entry.color === 'url(#colorIva15)' ? '#ef4444' : '#10b981' }} />
            <p className="text-sm font-semibold text-white">
              {entry.name}: <span className="font-mono">${formatMoney(entry.value)}</span>
            </p>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export const FiscalDashboard: React.FC<FiscalDashboardProps> = ({
  startDate,
  endDate,
  categoryIds,
}) => {
  const [report, setReport] = useState<unknown>(null);
  const [trendData, setTrendData] = useState<Array<unknown>>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load data on mount or date change
  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      try {
        const [reportResult, trendResult] = await Promise.all([
          fiscalAPI.getReport(startDate, endDate, categoryIds?.join(',')),
          fiscalAPI.getTrend(startDate, endDate, categoryIds?.join(',')),
        ]);

        setReport(reportResult.data);
        setTrendData(trendResult.data);
      } catch (error) {
        console.error('[FiscalDashboard] Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [startDate, endDate, categoryIds]);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'xml' | 'json'>('xml');

  const handleExportSRI = async () => {
    const year = new Date(endDate).getFullYear();
    setExporting(true);

    try {
      const response = await fiscalAPI.exportDeclaracionSRI(year, exportFormat);
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `declaracion_sri_${year}.${exportFormat}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      setShowExportModal(false);
    } catch (error) {
      console.error('[FiscalDashboard] Error exporting SRI declaration:', error);
      alert('Error al generar la declaración fiscal');
    } finally {
      setExporting(false);
    }
  };

  // Memoized chart configurations to prevent re-renders
  const barChartConfig = useMemo(() => ({
    margin: { top: 20, right: 30, left: 20, bottom: 5 },
  }), []);

  const pieChartConfig = useMemo(() => ({
    cx: '50%',
    cy: '50%',
    innerRadius: 75,
    outerRadius: 95,
    paddingAngle: 4,
    cornerRadius: 6,
    labelLine: false,
    label: false,
  }), []);

  // Calculate actual base spending breakdown (0% vs 15% VAT base)
  // Recharts Pie automatically maps the 'fill' key of each data object to style each slice natively
  const taxBreakdown = useMemo(() => {
    if (!report) return [];
    
    // We get actual IVA 15% amount paid. The base spending for it is amount / 0.15
    const iva15Paid = toNumber(report.totals.iva_pagado_15);
    const baseIva15 = iva15Paid / 0.15;
    
    // The remaining deductible spending carries 0% IVA
    const totalDeductible = toNumber(report.totals.total_deductible);
    const baseIva0 = Math.max(0, totalDeductible - baseIva15);

    return [
      { name: 'Base con IVA 15%', value: baseIva15, color: '#ef4444', fill: 'url(#colorIva15)' },
      { name: 'Base con IVA 0%', value: baseIva0, color: '#10b981', fill: 'url(#colorIva0)' },
    ].filter(item => item.value > 0);
  }, [report]);

  // Calculate net efficiency
  const netEfficiency = useMemo(() => {
    if (!report) return 0;
    const income = toNumber(report.totals.total_income);
    const totalOutflow = toNumber(report.totals.total_expenses) + toNumber(report.totals.iva_projected);
    if (income === 0) return 0;
    return ((income - totalOutflow) / income) * 100;
  }, [report]);

  // Cap Y-axis correctly using exact trendData fields
  const yDomain = useMemo(() => {
    if (trendData.length === 0) return [0, 0];
    
    const isMobile = window.innerWidth < 768;
    const percentile = isMobile ? 0.85 : 0.95;
    
    const allValues = trendData.flatMap(d => [toNumber(d.income), toNumber(d.expenses), toNumber(d.iva_projected)]);
    const sorted = allValues.filter(v => !isNaN(v)).sort((a, b) => a - b);
    
    if (sorted.length === 0) return [0, 1000];
    
    const pIndex = Math.floor(sorted.length * percentile);
    const pValue = sorted[pIndex] || sorted[sorted.length - 1];
    
    const magnitude = Math.pow(10, Math.floor(Math.log10(pValue || 100)));
    const capped = Math.ceil((pValue || 100) / magnitude) * magnitude;
    
    return [0, capped];
  }, [trendData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 text-center animate-pulse">
          <span className="text-sm font-semibold text-blue-400">Procesando datos fiscales y tasas de IVA del SRI...</span>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-8 relative">
      {/* Export Header */}
      <div className="flex justify-between items-center bg-slate-900/40 p-4 rounded-2xl border border-white/5 shadow-inner">
        <h3 className="text-lg font-black text-white uppercase tracking-wider">Resumen Fiscal</h3>
        <button
          onClick={() => setShowExportModal(true)}
          disabled={exporting}
          className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-blue-500/20"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Generando...' : 'Descargar Anexo SRI'}
        </button>
      </div>

      {/* SRI Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-[2rem] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20 shadow-inner">
                  <Download className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-2xl font-black text-white">Exportación SRI</h2>
                <p className="text-slate-400 mt-2">Selecciona el formato para tu declaración de Impuesto a la Renta {new Date(endDate).getFullYear()}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                  onClick={() => setExportFormat('xml')}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${
                    exportFormat === 'xml'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-lg shadow-blue-500/10'
                      : 'bg-slate-800/50 border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  <FileCode className="w-8 h-8" />
                  <span className="font-bold">SRI XML</span>
                </button>
                <button
                  onClick={() => setExportFormat('json')}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 ${
                    exportFormat === 'json'
                      ? 'bg-purple-600/20 border-purple-500 text-purple-400 shadow-lg shadow-purple-500/10'
                      : 'bg-slate-800/50 border-transparent text-slate-500 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  <FileJson className="w-8 h-8" />
                  <span className="font-bold">JSON Data</span>
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleExportSRI}
                  disabled={exporting}
                  className="flex-2 px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {exporting && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />}
                  Confirmar
                </button>
              </div>

              <div className="mt-6 p-4 bg-slate-800/30 rounded-xl border border-white/5">
                <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest font-bold">
                  Nota: El archivo incluirá los conceptos mapeados (3290, 3300, etc.) para gastos personales.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPICard
          title="IVA Real Pagado (15%)"
          value={`$${formatMoney(report.totals.iva_pagado_15)}`}
          subtitle="Acumulado real sobre categorías gravadas"
          color={COLORS.iva15}
          glowColor={COLORS.iva15}
          icon={<Percent className="w-5 h-5" />}
        />
        <KPICard
          title="Deducibilidad SRI"
          value={`$${formatMoney(report.totals.total_deductible)}`}
          subtitle="Gastos personales reportables al SRI"
          color={COLORS.deductible}
          glowColor={COLORS.deductible}
          icon={<Receipt className="w-5 h-5" />}
        />
        <KPICard
          title="Eficiencia Neta"
          value={`${netEfficiency.toFixed(1)}%`}
          subtitle="Ratio de ingresos vs egresos e impuestos"
          color={netEfficiency >= 0 ? COLORS.income : COLORS.expense}
          glowColor={netEfficiency >= 0 ? COLORS.income : COLORS.expense}
          icon={<ArrowUpRight className="w-5 h-5" />}
        />
      </div>

      {/* Two Column Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Monthly Deductible Expenses BarChart */}
        <div className="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between shadow-2xl">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">Tendencia de Flujo Fiscal</h3>
            <p className="text-xs text-slate-500 font-semibold mb-6">Comparativa mensual de tus Ingresos y Gastos Deducibles</p>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
              <BarChart data={trendData} {...barChartConfig}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.8}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.8}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: string) => {
                    const [, month] = value.split('-');
                    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                    const monthIndex = parseInt(month) - 1;
                    return monthNames[monthIndex] || value;
                  }}
                />
                <YAxis 
                  tickFormatter={(value) => `$${formatMoney(value, 0)}`}
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                  axisLine={false}
                  tickLine={false}
                  domain={yDomain}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '15px', fontSize: '12px' }} />
                <Bar dataKey="income" name="Ingresos" fill="url(#colorIncome)" radius={[6, 6, 0, 0]} barSize={16} />
                <Bar dataKey="expenses" name="Gastos Deducibles" fill="url(#colorExpenses)" radius={[6, 6, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tax Breakdown PieChart */}
        <div className="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between shadow-2xl relative">
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-wider mb-1">Distribución de IVA (15% vs 0%)</h3>
            <p className="text-xs text-slate-500 font-semibold mb-6">Desglose real de bases imponibles según normativa del SRI</p>
          </div>
          
          <div className="relative h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={0}>
              <PieChart>
                <defs>
                  <linearGradient id="colorIva15" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.9}/>
                    <stop offset="95%" stopColor="#b91c1c" stopOpacity={0.9}/>
                  </linearGradient>
                  <linearGradient id="colorIva0" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.9}/>
                    <stop offset="95%" stopColor="#047857" stopOpacity={0.9}/>
                  </linearGradient>
                </defs>
                <Pie
                  data={taxBreakdown}
                  {...pieChartConfig}
                  dataKey="value"
                  stroke="#0f172a"
                  strokeWidth={3}
                />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Centered Total Indicator */}
            <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">IVA Acumulado</span>
              <span className="text-2xl font-black text-white tracking-tight">${formatMoney(report.totals.iva_pagado_15)}</span>
            </div>
          </div>
          
          {/* Custom Custom Legend Grid for Donut */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5 text-center">
            {taxBreakdown.map((item, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs font-bold text-slate-400">{item.name}</span>
                </div>
                <span className="text-sm font-black text-white mt-1">${formatMoney(item.value)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

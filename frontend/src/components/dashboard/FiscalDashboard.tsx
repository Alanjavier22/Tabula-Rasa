/**
 * FiscalDashboard - FASE 3: Analytics Layer for Tabula Rasa
 * FASE 4: Added SRI Annex export with progress tracking
 * Visualizes fiscal data using Recharts with performance optimizations
 * Data bucketization at service level, aggressive memoization, mobile-first
 */

import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatMoney, toNumber } from '../../utils/money';
import { fiscalAPI } from '../../services/api';
import { Download, FileJson, FileCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Chart colors - accessible palette
const COLORS = {
  iva15: '#ef4444', // red
  iva0: '#10b981', // green
  exempt: '#3b82f6', // blue
  deductible: '#8b5cf6', // purple
  nonDeductible: '#6b7280', // gray
  income: '#10b981', // green
  expense: '#ef4444', // red
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
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, color }) => (
  <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
    <h3 className="text-sm font-medium text-slate-400 mb-1">{title}</h3>
    <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
  </div>
);

/**
 * Custom tooltip for charts with monetary formatting
 */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Format label from "2026-04" to "Abril de 2026"
    const formattedLabel = (() => {
      if (!label) return label;
      const [year, month] = label.split('-');
      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
      const monthIndex = parseInt(month) - 1;
      return `${monthNames[monthIndex]} de ${year}`;
    })();

    return (
      <div className="bg-slate-800 p-3 rounded-lg shadow-xl border border-slate-700">
        <p className="text-sm font-medium text-white mb-1">{formattedLabel}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs font-semibold" style={{ color: entry.color }}>
            {entry.name}: {formatMoney(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/**
 * Fiscal Dashboard Component
 * Displays KPIs, BarChart for monthly trends, PieChart for tax breakdown
 */
export const FiscalDashboard: React.FC<FiscalDashboardProps> = ({
  startDate,
  endDate,
  categoryIds,
}) => {
  const [report, setReport] = useState<any>(null);
  const [trendData, setTrendData] = useState<Array<any>>([]);
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

  // FASE 4: Export Declaración SRI (XML/JSON)
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'xml' | 'json'>('xml');

  const handleExportSRI = async () => {
    const year = new Date(endDate).getFullYear();
    setExporting(true);

    try {
      const response = await fiscalAPI.exportDeclaracionSRI(year, exportFormat);
      
      // Crear link de descarga
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
    labelLine: false,
    label: (entry: any) => `${entry.name}: ${formatMoney(entry.value)}`,
    outerRadius: 80,
  }), []);

  // Calculate tax breakdown for PieChart
  const taxBreakdown = useMemo(() => {
    if (!report) return [];
    
    // Use backend API totals directly
    const iva15 = report.totals.iva_pagado_15;
    const iva0 = report.totals.total_deductible - report.totals.iva_pagado_15;

    return [
      { name: 'IVA 15%', value: toNumber(iva15), color: COLORS.iva15 },
      { name: 'IVA 0%', value: toNumber(iva0), color: COLORS.iva0 },
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

  // Handle outliers: cap Y-axis at 95th percentile for mobile legibility
  // FASE 5: More aggressive cap on mobile (<768px) to prevent horizontal scroll
  const yDomain = useMemo(() => {
    if (trendData.length === 0) return [0, 0];
    
    const isMobile = window.innerWidth < 768;
    const percentile = isMobile ? 0.85 : 0.95; // More aggressive on mobile
    
    const allValues = trendData.flatMap(d => [d.income, d.expense, d.deductible]);
    const sorted = allValues.sort((a, b) => a - b);
    const pIndex = Math.floor(sorted.length * percentile);
    const pValue = sorted[pIndex] || sorted[sorted.length - 1];
    
    // Round up to nearest nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(pValue)));
    const capped = Math.ceil(pValue / magnitude) * magnitude;
    
    return [0, capped];
  }, [trendData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <span className="text-sm text-slate-400">Procesando datos fiscales...</span>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      {/* FASE 4: Export Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Resumen Fiscal</h3>
        <button
          onClick={() => setShowExportModal(true)}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg shadow-blue-500/5"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Generando...' : 'Descargar Anexo SRI'}
        </button>
      </div>

      {/* SRI Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
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


      {/* KPI Cards - FASE 5: Mobile-first vertical stacking */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="IVA Acumulado"
          value={formatMoney(report.totals.iva_pagado_15)}
          subtitle="Proyectado sobre categorías IVA 15%"
          color={COLORS.iva15}
        />
        <KPICard
          title="Deducibilidad SRI"
          value={formatMoney(report.totals.total_deductible)}
          subtitle="Gastos deducibles personales"
          color={COLORS.deductible}
        />
        <KPICard
          title="Eficiencia Neta"
          value={`${netEfficiency.toFixed(1)}%`}
          subtitle="Ingresos vs Gastos + Impuestos"
          color={netEfficiency >= 0 ? COLORS.income : COLORS.expense}
        />
      </div>

      {/* Monthly Deductible Expenses BarChart - FASE 5: Mobile responsive */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Gastos Deducibles Mensuales</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trendData} {...barChartConfig}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: string) => {
                const [year, month] = value.split('-');
                const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
                const monthIndex = parseInt(month) - 1;
                return `${monthNames[monthIndex]} de ${year}`;
              }}
            />
            <YAxis 
              tickFormatter={(value) => formatMoney(value)}
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              domain={yDomain}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Legend />
            <Bar dataKey="expenses" name="Gastos" fill={COLORS.deductible} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tax Breakdown PieChart - FASE 5: Mobile responsive */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Distribución de IVA (15% vs 0%)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={taxBreakdown}
              {...pieChartConfig}
              dataKey="value"
            >
              {taxBreakdown.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

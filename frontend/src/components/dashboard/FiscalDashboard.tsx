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
import { formatMoney } from '../../utils/money';
import { reportingService } from '../../services/ReportingService';
import { StreamedExporter, streamedExporter } from '../../utils/StreamedExporter';
import type { ReportResult } from '../../services/ReportingService';
import { Download } from 'lucide-react';

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
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
    <h3 className="text-sm font-medium text-gray-600 mb-1">{title}</h3>
    <p className="text-2xl font-bold" style={{ color }}>{value}</p>
    <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
  </div>
);

/**
 * Custom tooltip for charts with monetary formatting
 */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 rounded shadow-lg border border-gray-200">
        <p className="text-sm font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs" style={{ color: entry.color }}>
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
  const [report, setReport] = useState<ReportResult | null>(null);
  const [trendData, setTrendData] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Load data on mount or date change
  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setProgress(0);

      try {
        const [reportResult, trendResult] = await Promise.all([
          reportingService.generateReport(
            startDate,
            endDate,
            categoryIds,
            undefined,
            (processed, total) => setProgress(Math.round((processed / total) * 100))
          ),
          reportingService.getTrendData(
            startDate,
            endDate,
            categoryIds,
            undefined,
            (processed, total) => setProgress(Math.round((processed / total) * 100))
          ),
        ]);

        setReport(reportResult);
        setTrendData(trendResult);
      } catch (error) {
        console.error('[FiscalDashboard] Error loading data:', error);
      } finally {
        setLoading(false);
        setProgress(0);
      }
    };

    loadData();
  }, [startDate, endDate, categoryIds]);

  // FASE 4: Export SRI Annex
  const handleExportSRIAnnex = async () => {
    const year = new Date(endDate).getFullYear();
    setExporting(true);
    setExportProgress(0);

    try {
      const blob = await streamedExporter.exportSRIAnnex(year, (processed) => {
        setExportProgress(processed);
      });

      const filename = `anexo_gastos_sri_${year}.csv`;
      StreamedExporter.downloadBlob(blob, filename);
    } catch (error) {
      console.error('[FiscalDashboard] Error exporting SRI annex:', error);
    } finally {
      setExporting(false);
      setExportProgress(0);
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
    
    // Estimate breakdown based on category totals
    const iva15 = report.category_breakdown
      .filter(cat => cat.category_id.includes('vestimenta') || cat.category_id.includes('general'))
      .reduce((sum, cat) => sum + cat.amount_cents, 0);
    
    const iva0 = report.category_breakdown
      .filter(cat => cat.category_id.includes('alimentacion') || 
                   cat.category_id.includes('salud') || 
                   cat.category_id.includes('educacion') ||
                   cat.category_id.includes('vivienda'))
      .reduce((sum, cat) => sum + cat.amount_cents, 0);

    return [
      { name: 'IVA 15%', value: iva15, color: COLORS.iva15 },
      { name: 'IVA 0%', value: iva0, color: COLORS.iva0 },
    ].filter(item => item.value > 0);
  }, [report]);

  // Calculate net efficiency
  const netEfficiency = useMemo(() => {
    if (!report) return 0;
    const income = report.totals.total_income_cents;
    const totalOutflow = report.totals.total_expense_cents + report.totals.iva_projected_cents;
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
        <div className="bg-gray-100 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Procesando datos fiscales...</span>
            <span className="text-sm font-medium">{progress}%</span>
          </div>
          <div className="w-full bg-gray-300 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      {/* FASE 4: Export Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Resumen Fiscal</h3>
        <button
          onClick={handleExportSRIAnnex}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="w-4 h-4" />
          {exporting ? `Exportando... ${exportProgress}` : 'Descargar Anexo SRI'}
        </button>
      </div>

      {/* Export Progress */}
      {exporting && (
        <div className="bg-gray-100 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Generando anexo SRI...</span>
            <span className="text-sm font-medium">{exportProgress} registros</span>
          </div>
          <div className="w-full bg-gray-300 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* KPI Cards - FASE 5: Mobile-first vertical stacking */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title="IVA Acumulado"
          value={formatMoney(report.totals.iva_pagado_15_cents)}
          subtitle="Proyectado sobre categorías IVA 15%"
          color={COLORS.iva15}
        />
        <KPICard
          title="Deducibilidad SRI"
          value={formatMoney(report.totals.total_deductible_sri_cents)}
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-lg font-semibold mb-4">Gastos Deducibles Mensuales</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trendData} {...barChartConfig}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              tickFormatter={(value) => formatMoney(value)}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              domain={yDomain}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="deductible" name="Deducible" fill={COLORS.deductible} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tax Breakdown PieChart - FASE 5: Mobile responsive */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-lg font-semibold mb-4">Breakdown Impositivo</h3>
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

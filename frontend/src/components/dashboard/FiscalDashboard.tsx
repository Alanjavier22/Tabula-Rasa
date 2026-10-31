import Modal from '../common/Modal';
/**
 * FiscalDashboard - FASE 3: Analytics Layer for Tabula Rasa
 * FASE 4: Added SRI Annex export with progress tracking
 * Visualizes fiscal data using Recharts with performance optimizations
 * Fiscal analysis and charts for the local dashboard
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
import type { TooltipContentProps } from 'recharts';
import { formatMoney, toNumber } from '../../utils/money';
import { fiscalAPI } from '../../services/api';
import {
  Download,
  FileJson,
  FileCode,
  Percent,
  Receipt,
  ArrowUpRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FiscalReportResponse, MonthlyTrendItem } from '../../types';

// Chart colors
const COLORS = {
  iva15: 'var(--app-danger)',
  iva0: 'var(--app-success)',
  deductible: 'var(--app-info)',
  income: 'var(--app-success)',
  expense: 'var(--app-danger)',
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
}

const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  color,
  icon,
}) => (
  <article className="fiscal-kpi-card">
    <div className="fiscal-kpi-card-main">
      <div>
        <h3>{title}</h3>
        <p className="fiscal-kpi-value" style={{ color }}>
          {value}
        </p>
      </div>
      <div className="fiscal-kpi-icon" aria-hidden="true">
        {icon}
      </div>
    </div>
    <p className="fiscal-kpi-caption">{subtitle}</p>
  </article>
);

const getTooltipColor = (color: string | undefined) => {
  if (color === COLORS.income) return COLORS.income;
  if (color === COLORS.expense) return COLORS.expense;
  if (color === COLORS.iva15) return COLORS.iva15;
  if (color === COLORS.iva0) return COLORS.iva0;
  if (color === COLORS.deductible) return COLORS.deductible;
  return 'var(--app-muted)';
};

const CustomTooltip = ({ active, payload, label }: TooltipContentProps) => {
  if (active && payload?.length) {
    const formattedLabel = (() => {
      if (typeof label !== 'string' || !/^\d{4}-\d{2}$/.test(label)) {
        return label ?? payload[0]?.name ?? 'Detalle';
      }
      const [year, month] = label.split('-');
      const monthNames = [
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre',
      ];
      const monthIndex = Number.parseInt(month, 10) - 1;
      return monthNames[monthIndex]
        ? `${monthNames[monthIndex]} de ${year}`
        : payload[0]?.name ?? label;
    })();
    const showLabel = formattedLabel !== payload[0]?.name;

    return (
      <div className="fiscal-chart-tooltip">
        {showLabel && <p>{formattedLabel}</p>}
        {payload.map((entry) => (
          <div
            key={String(entry.name ?? entry.color ?? 'series')}
            className="fiscal-chart-tooltip-row"
          >
            <i
              aria-hidden="true"
              style={{ backgroundColor: getTooltipColor(entry.color) }}
            />
            <p>
              {entry.name}:{' '}
              <span className="font-mono">$ {formatMoney(entry.value)}</span>
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
  const [report, setReport] = useState<FiscalReportResponse | null>(null);
  const [trendData, setTrendData] = useState<MonthlyTrendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

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

    void loadData();
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

  const barChartConfig = useMemo(
    () => ({
      margin: { top: 16, right: 16, left: 8, bottom: 4 },
    }),
    [],
  );

  const pieChartConfig = useMemo(
    () => ({
      cx: '50%',
      cy: '50%',
      innerRadius: 72,
      outerRadius: 96,
      paddingAngle: 3,
      cornerRadius: 4,
      labelLine: false,
      label: false,
    }),
    [],
  );

  const taxBreakdown = useMemo(() => {
    if (!report) return [];

    const iva15Paid = toNumber(report.totals.iva_pagado_15);
    const baseIva15 = iva15Paid / 0.15;

    const totalDeductible = toNumber(report.totals.total_deductible);
    const baseIva0 = Math.max(0, totalDeductible - baseIva15);

    return [
      {
        name: 'Base con IVA 15%',
        value: baseIva15,
        color: COLORS.iva15,
        fill: COLORS.iva15,
      },
      {
        name: 'Base con IVA 0%',
        value: baseIva0,
        color: COLORS.iva0,
        fill: COLORS.iva0,
      },
    ].filter((item) => item.value > 0);
  }, [report]);

  const netEfficiency = useMemo(() => {
    if (!report) return 0;
    const income = toNumber(report.totals.total_income);
    const totalOutflow =
      toNumber(report.totals.total_expenses) +
      toNumber(report.totals.iva_projected);
    if (income === 0) return 0;
    return ((income - totalOutflow) / income) * 100;
  }, [report]);

  const yDomain = useMemo(() => {
    if (trendData.length === 0) return [0, 0];

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const percentile = isMobile ? 0.85 : 0.95;

    const allValues = trendData.flatMap((d) => [
      toNumber(d.income),
      toNumber(d.expenses),
      toNumber(d.iva_projected),
    ]);
    const sorted = allValues
      .filter((v) => !Number.isNaN(v))
      .sort((a, b) => a - b);

    if (sorted.length === 0) return [0, 1000];

    const pIndex = Math.floor(sorted.length * percentile);
    const pValue = sorted[pIndex] || sorted[sorted.length - 1];

    const magnitude = Math.pow(10, Math.floor(Math.log10(pValue || 100)));
    const capped = Math.ceil((pValue || 100) / magnitude) * magnitude;

    return [0, capped];
  }, [trendData]);

  if (loading) {
    return (
      <div className="fiscal-loading" role="status" aria-busy="true">
        <span className="text-sm font-medium text-muted">
          Procesando datos fiscales y tasas de IVA del SRI…
        </span>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="fiscal-dashboard-content">
      {/* Export Header */}
      <div className="fiscal-summary-header">
        <div>
          <span className="fiscal-kicker">Anexo de gastos personales</span>
          <h2>Resumen fiscal del período</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowExportModal(true)}
          disabled={exporting}
          className="app-btn app-btn-primary"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {exporting ? 'Generando…' : 'Descargar anexo SRI'}
        </button>
      </div>

      {/* SRI Export Modal */}
      <AnimatePresence>
        {showExportModal && (
          <Modal
            onClose={() => setShowExportModal(false)}
            label={'Exportar resumen fiscal'}
          >
            <motion.div
              initial={false}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="fiscal-export-modal bg-surface border border-line p-6 max-w-md w-full"
            >
              <div className="text-center mb-6">
                <div className="fiscal-export-icon" aria-hidden="true">
                  <Download className="w-6 h-6 text-info" />
                </div>
                <h2 className="text-xl font-bold text-primary">
                  Exportación SRI
                </h2>
                <p className="text-muted text-sm mt-1">
                  Selecciona el formato para tu declaración de Impuesto a la
                  Renta {new Date(endDate).getFullYear()}.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  type="button"
                  onClick={() => setExportFormat('xml')}
                  className={`fiscal-format-option ${
                    exportFormat === 'xml' ? 'is-active' : ''
                  }`}
                  aria-pressed={exportFormat === 'xml'}
                >
                  <FileCode className="w-6 h-6" aria-hidden="true" />
                  <span className="font-semibold text-sm">SRI XML</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat('json')}
                  className={`fiscal-format-option ${
                    exportFormat === 'json' ? 'is-active' : ''
                  }`}
                  aria-pressed={exportFormat === 'json'}
                >
                  <FileJson className="w-6 h-6" aria-hidden="true" />
                  <span className="font-semibold text-sm">JSON</span>
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="app-btn flex-1"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExportSRI}
                  disabled={exporting}
                  className="app-btn app-btn-primary flex-1"
                >
                  {exporting && (
                    <span className="fiscal-export-spinner" aria-hidden="true" />
                  )}
                  Confirmar
                </button>
              </div>

              <div className="mt-4 p-3 bg-surface-soft border border-line">
                <p className="text-xs text-muted text-center">
                  El archivo incluirá los conceptos mapeados para gastos
                  personales deducibles.
                </p>
              </div>
            </motion.div>
          </Modal>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      <div className="fiscal-kpi-grid">
        <KPICard
          title="IVA real pagado (15%)"
          value={`$ ${formatMoney(report.totals.iva_pagado_15)}`}
          subtitle="Acumulado real sobre categorías gravadas"
          color={COLORS.iva15}
          icon={<Percent className="w-4 h-4" />}
        />
        <KPICard
          title="Deducibilidad SRI"
          value={`$ ${formatMoney(report.totals.total_deductible)}`}
          subtitle="Gastos personales reportables al SRI"
          color={COLORS.deductible}
          icon={<Receipt className="w-4 h-4" />}
        />
        <KPICard
          title="Eficiencia neta"
          value={`${netEfficiency.toFixed(1)}%`}
          subtitle="Ratio de ingresos frente a egresos e impuestos"
          color={netEfficiency >= 0 ? COLORS.income : COLORS.expense}
          icon={<ArrowUpRight className="w-4 h-4" />}
        />
      </div>

      {/* Two Column Chart Section */}
      <div className="fiscal-charts-grid">
        {/* Monthly Deductible Expenses BarChart */}
        <section className="fiscal-chart-panel">
          <div className="fiscal-chart-heading">
            <div>
              <h3>Tendencia de flujo fiscal</h3>
              <p>Comparativa mensual de ingresos y gastos deducibles.</p>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} {...barChartConfig}>
                <CartesianGrid
                  strokeDasharray="2 4"
                  stroke="var(--app-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'var(--app-muted)' }}
                  axisLine={{ stroke: 'var(--app-border)' }}
                  tickLine={false}
                  tickFormatter={(value: string) => {
                    const [, month] = value.split('-');
                    const monthNames = [
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
                    const monthIndex = Number.parseInt(month, 10) - 1;
                    return monthNames[monthIndex] || value;
                  }}
                />
                <YAxis
                  tickFormatter={(value) => `$${formatMoney(value, 0)}`}
                  tick={{ fontSize: 11, fill: 'var(--app-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  domain={yDomain}
                />
                <Tooltip
                  content={CustomTooltip}
                  cursor={{ fill: 'var(--app-surface-soft)' }}
                  wrapperStyle={{ zIndex: 20, pointerEvents: 'none' }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '12px', fontSize: '12px' }}
                />
                <Bar
                  dataKey="income"
                  name="Ingresos"
                  fill={COLORS.income}
                  radius={[2, 2, 0, 0]}
                  barSize={16}
                />
                <Bar
                  dataKey="expenses"
                  name="Gastos deducibles"
                  fill={COLORS.expense}
                  radius={[2, 2, 0, 0]}
                  barSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Tax Breakdown PieChart */}
        <section className="fiscal-chart-panel">
          <div className="fiscal-chart-heading">
            <div>
              <h3>Distribución de IVA (15 % y 0 %)</h3>
              <p>Desglose de bases imponibles según el régimen aplicable.</p>
            </div>
            <div className="fiscal-chart-total">
              <span>IVA pagado</span>
              <strong>$ {formatMoney(report.totals.iva_pagado_15)}</strong>
            </div>
          </div>

          {taxBreakdown.length > 0 ? (
            <>
              <div className="fiscal-donut-stage">
                <div className="fiscal-donut-center" aria-hidden="true">
                  <span>IVA 15%</span>
                  <strong>$ {formatMoney(report.totals.iva_pagado_15)}</strong>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={taxBreakdown}
                      {...pieChartConfig}
                      dataKey="value"
                      stroke="var(--app-surface)"
                      strokeWidth={3}
                    />
                    <Tooltip
                      content={CustomTooltip}
                      position={{ x: 10, y: 10 }}
                      wrapperStyle={{ zIndex: 25, pointerEvents: 'none' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="fiscal-donut-legend">
                {taxBreakdown.map((item) => (
                  <div key={item.name} className="fiscal-donut-legend-item">
                    <div className="fiscal-donut-legend-label">
                      <span
                        className="fiscal-donut-dot"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <strong>$ {formatMoney(item.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="fiscal-donut-empty">
              <p>
                No se registran bases imponibles deducibles en el rango de
                fechas seleccionado.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

import ChartDataTable from './ChartDataTable';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useReducedMotion } from 'framer-motion';
import type { DashboardSummaryResponse } from '../../types';
import SkeletonChart from './SkeletonChart';

interface DailySpendingChartProps {
  dashboardSummary: DashboardSummaryResponse | undefined;
  dailySpending: Array<{ date: string; gasto: number }>;
}

const MONTH_NAMES = [
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

const formatDayLabel = (value: string) => {
  const [month, day] = value.split('-');
  const monthIndex = Number.parseInt(month, 10) - 1;
  const dayNum = Number.parseInt(day, 10);
  return `${dayNum} de ${MONTH_NAMES[monthIndex] ?? month}`;
};

const formatUSD = (num: number) =>
  num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const DailySpendingChart = ({
  dashboardSummary,
  dailySpending,
}: DailySpendingChartProps) => {
  const prefersReducedMotion = useReducedMotion();

  const totalSpent = dailySpending.reduce(
    (sum, item) => sum + (item.gasto || 0),
    0,
  );
  const dailyAverage =
    dailySpending.length > 0 ? totalSpent / dailySpending.length : 0;
  const peakDay = dailySpending.reduce<
    (typeof dailySpending)[number] | undefined
  >(
    (highest, item) => (!highest || item.gasto > highest.gasto ? item : highest),
    undefined,
  );

  return (
    <section className="app-chart-panel" aria-label="Gasto diario">
      <div className="chart-panel-head">
        <div>
          <span className="dashboard-panel-kicker">Ritmo diario</span>
          <h3>Gasto diario del periodo</h3>
        </div>
        {dashboardSummary && dailySpending.length > 0 && (
          <div className="chart-panel-head-stat">
            <span>Promedio diario</span>
            <strong>$ {formatUSD(dailyAverage)}</strong>
          </div>
        )}
      </div>

      {dashboardSummary && dailySpending.length > 0 && (
        <div className="chart-kpi-strip">
          <div className="chart-kpi-item">
            <span>Total acumulado</span>
            <strong>$ {formatUSD(totalSpent)}</strong>
          </div>
          {peakDay && (
            <div className="chart-kpi-item">
              <span>Pico ({formatDayLabel(peakDay.date)})</span>
              <strong className="text-danger">$ {formatUSD(peakDay.gasto)}</strong>
            </div>
          )}
          <div className="chart-kpi-item">
            <span>Días con registro</span>
            <strong>{dailySpending.length} días</strong>
          </div>
        </div>
      )}

      {dashboardSummary && dailySpending.length > 0 && (
        <div className="cash-flow-chart-wrap">
          <ResponsiveContainer width="100%" height={235}>
            <AreaChart
              data={dailySpending}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="2 5"
                stroke="var(--app-border)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--app-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--app-border)' }}
                tickFormatter={(val: string) => {
                  const [m, d] = val.split('-');
                  return `${d}/${m}`;
                }}
              />
              <YAxis
                tick={{ fill: 'var(--app-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={58}
                tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--app-surface)',
                  border: '1px solid var(--app-border-strong)',
                  borderRadius: '4px',
                  color: 'var(--app-text)',
                  boxShadow: '0 8px 20px rgba(37, 34, 30, 0.12)',
                  fontSize: '12px',
                }}
                labelFormatter={(label) => {
                  if (typeof label !== 'string') return '';
                  return formatDayLabel(label);
                }}
                formatter={(value) => [
                  `$ ${formatUSD(typeof value === 'number' ? value : Number(value ?? 0))}`,
                  'Gasto del día',
                ]}
              />
              {dailyAverage > 0 && (
                <ReferenceLine
                  y={dailyAverage}
                  stroke="var(--app-muted)"
                  strokeDasharray="3 3"
                  strokeWidth={1.2}
                />
              )}
              <Area
                isAnimationActive={!prefersReducedMotion}
                animationDuration={420}
                animationEasing="ease-out"
                type="monotone"
                dataKey="gasto"
                stroke="var(--app-accent-strong)"
                fill="var(--app-accent-soft)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {dashboardSummary && dailySpending.length === 0 && (
        <p className="text-muted text-center py-8">
          No hay movimientos en este periodo.
        </p>
      )}
      {!dashboardSummary && <SkeletonChart height="h-56" />}
      <ChartDataTable
        caption="Gasto diario"
        columns={['Día', 'Gasto']}
        rows={dailySpending.map((item) => [
          formatDayLabel(item.date),
          `$ ${formatUSD(item.gasto)}`,
        ])}
      />
    </section>
  );
};

export default DailySpendingChart;

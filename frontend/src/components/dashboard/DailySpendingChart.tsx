import ChartDataTable from './ChartDataTable';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashboardSummaryResponse } from '../../types';
import SkeletonChart from './SkeletonChart';

interface DailySpendingChartProps {
  dashboardSummary: DashboardSummaryResponse | undefined;
  dailySpending: Array<{ date: string; gasto: number }>;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const formatDayLabel = (value: string) => {
  const [month, day] = value.split('-');
  const monthIndex = Number.parseInt(month) - 1;
  const dayNum = Number.parseInt(day);
  return `${dayNum} de ${MONTH_NAMES[monthIndex]}`;
};

const DailySpendingChart = ({ dashboardSummary, dailySpending }: DailySpendingChartProps) => {
  return (
    <div className="bg-surface  rounded-2xl border border-line p-4 lg:p-6 mb-6">
      <h3 className="text-lg font-semibold text-primary mb-4">Gasto Diario</h3>
      {dashboardSummary && dailySpending.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dailySpending}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--app-muted)', fontSize: 12 }}
              tickFormatter={formatDayLabel}
            />
            <YAxis
              tick={{ fill: 'var(--app-muted)', fontSize: 12 }}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                borderRadius: '12px',
                color: 'var(--app-text)',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              }}
              labelFormatter={(label) => {
                if (typeof label !== 'string') return '';
                return formatDayLabel(label);
              }}
              formatter={(value) => [`$${(typeof value === 'number' ? value : Number(value ?? 0)).toLocaleString()}`, 'Gasto']}
            />
            <Area isAnimationActive={false} type="monotone" dataKey="gasto" stroke="var(--app-accent-strong)" fill="var(--app-accent-soft)" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      )}
      {dashboardSummary && dailySpending.length === 0 && (
        <p className="text-muted text-center py-8">No hay movimientos en este periodo.</p>
      )}
      {!dashboardSummary && (
        <SkeletonChart height="h-56" />
      )}
      <ChartDataTable caption="Gasto diario" columns={['Día', 'Gasto']} rows={dailySpending.map(item => [formatDayLabel(item.date), `$ ${item.gasto.toFixed(2)}`])} />
    </div>
  );
};

export default DailySpendingChart;

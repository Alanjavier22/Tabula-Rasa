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
  const monthIndex = parseInt(month) - 1;
  const dayNum = parseInt(day);
  return `${dayNum} de ${MONTH_NAMES[monthIndex]}`;
};

const DailySpendingChart = ({ dashboardSummary, dailySpending }: DailySpendingChartProps) => {
  return (
    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 mb-6">
      <h3 className="text-lg font-semibold text-white mb-4">Gasto Diario</h3>
      {dashboardSummary && dailySpending.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dailySpending}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={formatDayLabel}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(value) => `$${value.toLocaleString()}`}
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
              labelFormatter={(label) => {
                if (typeof label !== 'string') return '';
                return formatDayLabel(label);
              }}
              formatter={(value) => [`$${(typeof value === 'number' ? value : Number(value ?? 0)).toLocaleString()}`, 'Gasto']}
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
  );
};

export default DailySpendingChart;

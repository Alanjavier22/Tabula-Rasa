import { PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashboardSummaryResponse } from '../../types';
import { formatMoney } from '../../utils/money';
import SkeletonChart from './SkeletonChart';

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

interface ExpenseBreakdownChartProps {
  dashboardSummary: DashboardSummaryResponse | undefined;
  expenseBreakdown: DashboardSummaryResponse['expense_breakdown'];
}

const ExpenseBreakdownChart = ({ dashboardSummary, expenseBreakdown }: ExpenseBreakdownChartProps) => {
  return (
    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Distribución de Gastos</h3>
      {dashboardSummary ? (
        expenseBreakdown.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <Pie
                    data={expenseBreakdown.map((item, i) => ({
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
                      formatter={(value, name) => {
                        const total = expenseBreakdown.reduce((sum, item) => {
                          const val = typeof item.value === 'string' ? parseFloat(item.value) : item.value;
                          return sum + (isNaN(val) ? 0 : val);
                        }, 0);
                        const numValue = typeof value === 'number' ? value : Number(value ?? 0);
                        const percentage = total > 0 ? ((numValue / total) * 100).toFixed(1) : 0;
                        return [`$${formatMoney(numValue)} (${percentage}%)`, name];
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
  );
};

export default ExpenseBreakdownChart;

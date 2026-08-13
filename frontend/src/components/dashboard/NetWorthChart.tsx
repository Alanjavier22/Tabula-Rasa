import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { NetWorthResponse } from '../../types';
import { formatMoney, toDecimal } from '../../utils/money';
import SkeletonChart from './SkeletonChart';

interface NetWorthChartProps {
  netWorth: NetWorthResponse | undefined;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-');
  const monthIndex = parseInt(month) - 1;
  return `${MONTH_NAMES[monthIndex]} de ${year}`;
};

const NetWorthChart = ({ netWorth }: NetWorthChartProps) => {
  if (!netWorth) {
    return <SkeletonChart height="h-56" />;
  }

  return (
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
              tickFormatter={formatMonthLabel}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(value) => `$${(value / 100).toLocaleString()}`}
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
                return formatMonthLabel(label);
              }}
              formatter={(value, name) => [`$${formatMoney(value)}`, name ?? '']}
            />
            <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} name="Ingresos" dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} name="Gastos" dot={{ r: 4, fill: '#ef4444' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-slate-500 text-center py-8">Sin datos históricos</p>
      )}
    </div>
  );
};

export default NetWorthChart;

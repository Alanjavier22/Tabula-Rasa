import ChartDataTable from './ChartDataTable';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { NetWorthResponse } from '../../types';
import { formatMoney, toDecimal } from '../../utils/money';
import SkeletonChart from './SkeletonChart';

interface NetWorthChartProps {
  netWorth: NetWorthResponse | undefined;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-');
  const monthIndex = Number.parseInt(month) - 1;
  return `${MONTH_NAMES[monthIndex]} de ${year}`;
};

const NetWorthChart = ({ netWorth }: NetWorthChartProps) => {
  if (!netWorth) {
    return <SkeletonChart height="h-56" />;
  }

  return (
    <div className="bg-surface  rounded-2xl border border-line p-4 lg:p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-primary">Patrimonio e histórico</h3>
        <div className="text-right">
          <p className="text-xs text-muted">Activos: ${formatMoney(netWorth.assets)}</p>
          <p className="text-xs text-muted">Pasivos: ${formatMoney(netWorth.liabilities)}</p>
          <p className={`text-sm font-bold ${toDecimal(netWorth.net_worth).gte(0) ? 'text-success' : 'text-danger'}`}>
            Patrimonio Neto: ${formatMoney(netWorth.net_worth)}
          </p>
        </div>
      </div>
      <p className="text-muted text-sm mb-3">Las líneas muestran ingresos y gastos por mes; el patrimonio actual figura en el resumen.</p>
      {(netWorth.history ?? []).length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={netWorth.history}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: 'var(--app-muted)', fontSize: 12 }}
              tickFormatter={formatMonthLabel}
            />
            <YAxis
              tick={{ fill: 'var(--app-muted)', fontSize: 12 }}
              tickFormatter={(value) => `$${(value / 100).toLocaleString()}`}
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
                return formatMonthLabel(label);
              }}
              formatter={(value, name) => [`$${formatMoney(value)}`, name ?? '']}
            />
            <Legend />
            <Line isAnimationActive={false} type="monotone" dataKey="income" stroke="var(--app-success)" strokeWidth={3} name="Ingresos" dot={{ r: 4, fill: 'var(--app-success)' }} activeDot={{ r: 6 }} />
            <Line isAnimationActive={false} type="monotone" dataKey="expense" strokeDasharray="4 4" stroke="var(--app-danger)" strokeWidth={3} name="Gastos" dot={{ r: 4, fill: 'var(--app-danger)' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-muted text-center py-8">Aún no hay cierres registrados para comparar periodos.</p>
      )}
      <ChartDataTable caption="Histórico de ingresos y gastos" columns={['Mes', 'Ingresos', 'Gastos']} rows={(netWorth.history ?? []).map(item => [formatMonthLabel(item.month), `$ ${formatMoney(item.income)}`, `$ ${formatMoney(item.expense)}`])} />
    </div>
  );
};

export default NetWorthChart;

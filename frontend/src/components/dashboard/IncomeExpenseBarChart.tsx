import ChartDataTable from './ChartDataTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface IncomeExpenseBarChartProps {
  hasData: boolean;
  monthlyComparison: Array<{ mes: string; Ingresos: number; Gastos: number }>;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-');
  const monthIndex = Number.parseInt(month) - 1;
  return `${MONTH_NAMES[monthIndex]} de ${year}`;
};

const IncomeExpenseBarChart = ({ hasData, monthlyComparison }: IncomeExpenseBarChartProps) => {
  return (
    <div className="bg-surface  rounded-2xl border border-line p-4 lg:p-6">
      <h3 className="text-lg font-semibold text-primary mb-4">Histórico de Ingresos vs Gastos</h3>
      {hasData && monthlyComparison.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyComparison} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
            <XAxis
              dataKey="mes"
              tick={{ fill: 'var(--app-muted)', fontSize: 12 }}
              tickFormatter={formatMonthLabel}
            />
            <YAxis tick={{ fill: 'var(--app-muted)', fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
                borderRadius: '12px',
                color: 'var(--app-text)',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              }}
              cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }}
              labelFormatter={(label) => {
                if (typeof label !== 'string') return '';
                return formatMonthLabel(label);
              }}
              formatter={(value, name) => [`$${(typeof value === 'number' ? value : Number(value ?? 0)).toLocaleString()}`, name]}
            />
            <Legend />
            <Bar isAnimationActive={false} dataKey="Ingresos" fill="var(--app-success)" radius={[10, 10, 0, 0]} barSize={12} />
            <Bar isAnimationActive={false} dataKey="Gastos" fill="var(--app-danger)" radius={[10, 10, 0, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-muted text-center py-8">No hay movimientos en este periodo.</p>
      )}
      <ChartDataTable caption="Ingresos y gastos" columns={['Mes', 'Ingresos', 'Gastos']} rows={monthlyComparison.map(item => [formatMonthLabel(item.mes), `$ ${item.Ingresos.toFixed(2)}`, `$ ${item.Gastos.toFixed(2)}`])} />
    </div>
  );
};

export default IncomeExpenseBarChart;

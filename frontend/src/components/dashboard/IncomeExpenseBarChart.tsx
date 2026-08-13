import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface IncomeExpenseBarChartProps {
  hasData: boolean;
  monthlyComparison: Array<{ mes: string; Ingresos: number; Gastos: number }>;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const formatMonthLabel = (value: string) => {
  const [year, month] = value.split('-');
  const monthIndex = parseInt(month) - 1;
  return `${MONTH_NAMES[monthIndex]} de ${year}`;
};

const IncomeExpenseBarChart = ({ hasData, monthlyComparison }: IncomeExpenseBarChartProps) => {
  return (
    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Histórico de Ingresos vs Gastos</h3>
      {hasData && monthlyComparison.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyComparison} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51, 65, 85, 0.3)" vertical={false} />
            <XAxis
              dataKey="mes"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={formatMonthLabel}
            />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(148, 163, 184, 0.1)',
                borderRadius: '12px',
                color: '#fff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
              }}
              cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }}
              labelFormatter={(label) => {
                if (typeof label !== 'string') return '';
                return formatMonthLabel(label);
              }}
              formatter={(value, name) => [`$${(typeof value === 'number' ? value : Number(value ?? 0)).toLocaleString()}`, name]}
            />
            <Bar dataKey="Ingresos" fill="url(#gradIngresos)" radius={[10, 10, 0, 0]} barSize={12} />
            <Bar dataKey="Gastos" fill="url(#gradGastos)" radius={[10, 10, 0, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-slate-500 text-center py-8">Sin datos</p>
      )}
    </div>
  );
};

export default IncomeExpenseBarChart;

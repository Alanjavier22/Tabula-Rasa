import { formatMonthLabel, formatMonthShort, formatUSD } from '../../utils/chartFormatters';
import ChartDataTable from './ChartDataTable';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useReducedMotion } from 'framer-motion';

interface IncomeExpenseBarChartProps {
  hasData: boolean;
  monthlyComparison: Array<{ mes: string; Ingresos: number; Gastos: number }>;
}


const IncomeExpenseBarChart = ({
  hasData,
  monthlyComparison,
}: IncomeExpenseBarChartProps) => {
  const prefersReducedMotion = useReducedMotion();

  const totalIncome = monthlyComparison.reduce(
    (sum, item) => sum + (item.Ingresos || 0),
    0,
  );
  const totalExpense = monthlyComparison.reduce(
    (sum, item) => sum + (item.Gastos || 0),
    0,
  );
  const netAccumulated = totalIncome - totalExpense;
  const savingsRate =
    totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

  return (
    <section
      className="app-chart-panel"
      aria-label="Histórico de ingresos vs gastos"
    >
      <div className="chart-panel-head">
        <div>
          <span className="dashboard-panel-kicker">Comparativa mensual</span>
          <h3>Ingresos frente a gastos</h3>
        </div>
        {hasData && monthlyComparison.length > 0 && (
          <div className="chart-panel-head-stat">
            <span>Tasa de ahorro</span>
            <strong className={savingsRate >= 0 ? 'text-success' : 'text-danger'}>
              {savingsRate.toFixed(1)}%
            </strong>
          </div>
        )}
      </div>

      {hasData && monthlyComparison.length > 0 && (
        <div className="chart-kpi-strip">
          <div className="chart-kpi-item">
            <span>Ingresos del periodo</span>
            <strong className="text-success">$ {formatUSD(totalIncome)}</strong>
          </div>
          <div className="chart-kpi-item">
            <span>Gastos del periodo</span>
            <strong>$ {formatUSD(totalExpense)}</strong>
          </div>
          <div className="chart-kpi-item">
            <span>Resultado neto</span>
            <strong
              className={netAccumulated >= 0 ? 'text-success' : 'text-danger'}
            >
              {netAccumulated >= 0 ? '+' : '−'}${' '}
              {formatUSD(Math.abs(netAccumulated))}
            </strong>
          </div>
        </div>
      )}

      {hasData && monthlyComparison.length > 0 ? (
        <div className="cash-flow-chart-wrap">
          <ResponsiveContainer width="100%" height={235}>
            <BarChart
              data={monthlyComparison}
              barGap={6}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="2 5"
                stroke="var(--app-border)"
                vertical={false}
              />
              <XAxis
                dataKey="mes"
                tick={{ fill: 'var(--app-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--app-border)' }}
                tickFormatter={formatMonthShort}
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
                cursor={{ fill: 'var(--app-surface-soft)' }}
                labelFormatter={(label) => {
                  if (typeof label !== 'string') return '';
                  return formatMonthLabel(label);
                }}
                formatter={(value, name) => [
                  `$ ${formatUSD(typeof value === 'number' ? value : Number(value ?? 0))}`,
                  name,
                ]}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <Bar
                isAnimationActive={!prefersReducedMotion}
                animationDuration={420}
                animationEasing="ease-out"
                dataKey="Ingresos"
                fill="var(--app-success)"
                radius={[2, 2, 0, 0]}
                barSize={16}
              />
              <Bar
                isAnimationActive={!prefersReducedMotion}
                animationDuration={420}
                animationEasing="ease-out"
                dataKey="Gastos"
                fill="var(--app-danger)"
                radius={[2, 2, 0, 0]}
                barSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-muted text-center py-8">
          No hay movimientos en este periodo.
        </p>
      )}
      <ChartDataTable
        caption="Ingresos y gastos"
        columns={['Mes', 'Ingresos', 'Gastos', 'Ahorro neto']}
        rows={monthlyComparison.map((item) => {
          const net = item.Ingresos - item.Gastos;
          return [
            formatMonthLabel(item.mes),
            `$ ${formatUSD(item.Ingresos)}`,
            `$ ${formatUSD(item.Gastos)}`,
            `${net >= 0 ? '+' : '−'}$ ${formatUSD(Math.abs(net))}`,
          ];
        })}
      />
    </section>
  );
};

export default IncomeExpenseBarChart;

import { formatMonthLabel, formatMonthShort, formatUSD } from '../../utils/chartFormatters';
import ChartDataTable from './ChartDataTable';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useReducedMotion } from 'framer-motion';
import type { NetWorthResponse } from '../../types';
import { formatMoney, toDecimal } from '../../utils/money';
import SkeletonChart from './SkeletonChart';

interface NetWorthChartProps {
  netWorth: NetWorthResponse | undefined;
}

interface EvolutionPoint {
  month: string;
  netFlowUSD: number;
  cumulativeUSD: number;
  netCents: number;
  cumulativeCents: number;
  retentionPct: number;
}


const NetWorthChart = ({ netWorth }: NetWorthChartProps) => {
  const prefersReducedMotion = useReducedMotion();

  if (!netWorth) {
    return <SkeletonChart height="h-56" />;
  }

  const assetsDec = toDecimal(netWorth.assets);
  const liabilitiesDec = toDecimal(netWorth.liabilities).abs();
  const netWorthDec = toDecimal(netWorth.net_worth);

  const debtRatio = assetsDec.gt(0)
    ? liabilitiesDec.dividedBy(assetsDec).times(100).toNumber()
    : 0;
  const clampedDebtRatio = Math.min(100, Math.max(0, debtRatio));
  const equityRatio = Math.max(0, 100 - clampedDebtRatio);

  // Transform monthly history into net cash generation + cumulative capital curve
  // so this chart is never a duplicate of IncomeExpenseBarChart.
  const evolutionSeries = (netWorth.history ?? []).reduce<EvolutionPoint[]>(
    (acc, item) => {
      const previousCumulative =
        acc.at(-1)?.cumulativeCents ?? 0;
      const incomeCents = Number(item.income || 0);
      const expenseCents = Number(item.expense || 0);
      const netCents = incomeCents - expenseCents;
      const cumulativeCents = previousCumulative + netCents;
      const retentionPct =
        incomeCents > 0 ? ((incomeCents - expenseCents) / incomeCents) * 100 : 0;

      acc.push({
        month: item.month,
        netFlowUSD: netCents / 100,
        cumulativeUSD: cumulativeCents / 100,
        netCents,
        cumulativeCents,
        retentionPct,
      });
      return acc;
    },
    [],
  );

  return (
    <section
      className="app-chart-panel"
      aria-label="Estructura patrimonial y ahorro acumulado"
    >
      <div className="chart-panel-head">
        <div>
          <span className="dashboard-panel-kicker">Solidez financiera</span>
          <h3>Estructura patrimonial y capital acumulado</h3>
        </div>
        <div className="chart-panel-head-stat">
          <span>Patrimonio neto actual</span>
          <strong className={netWorthDec.gte(0) ? 'text-success' : 'text-danger'}>
            {netWorthDec.lt(0) ? '−' : ''}$ {formatMoney(netWorthDec.abs())}
          </strong>
        </div>
      </div>

      <div className="chart-kpi-strip">
        <div className="chart-kpi-item">
          <span>Activos totales</span>
          <strong className="text-success">$ {formatMoney(netWorth.assets)}</strong>
        </div>
        <div className="chart-kpi-item">
          <span>Pasivos exigibles</span>
          <strong className="text-danger">$ {formatMoney(liabilitiesDec)}</strong>
        </div>
        <div className="chart-kpi-item">
          <span>Índice de solvencia</span>
          <strong className={debtRatio > 60 ? 'text-danger' : 'text-primary'}>
            {equityRatio.toFixed(1)}% libre · {debtRatio.toFixed(1)}% deuda
          </strong>
        </div>
      </div>

      {assetsDec.gt(0) && (
        <div
          className="net-worth-structure-bar-wrap"
          aria-label="Proporción entre patrimonio libre y pasivos"
        >
          <div className="net-worth-structure-labels">
            <span>
              Capital libre de deuda: <strong>{equityRatio.toFixed(1)}%</strong>
            </span>
            <span>
              Pasivos sobre activos: <strong>{debtRatio.toFixed(1)}%</strong>
            </span>
          </div>
          <div className="net-worth-structure-track">
            <div
              className="net-worth-structure-equity"
              style={{ width: `${equityRatio}%` }}
            />
            <div
              className="net-worth-structure-debt"
              style={{ width: `${clampedDebtRatio}%` }}
            />
          </div>
        </div>
      )}

      {evolutionSeries.length > 0 ? (
        <div className="cash-flow-chart-wrap">
          <ResponsiveContainer width="100%" height={225}>
            <ComposedChart
              data={evolutionSeries}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="2 5"
                stroke="var(--app-border)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--app-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--app-border)' }}
                tickFormatter={formatMonthShort}
              />
              <YAxis
                tick={{ fill: 'var(--app-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={64}
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
                  return formatMonthLabel(label);
                }}
                formatter={(value, name) => {
                  const num =
                    typeof value === 'number' ? value : Number(value ?? 0);
                  const prefix = num >= 0 ? '' : '−';
                  return [`${prefix}$ ${formatUSD(Math.abs(num))}`, name ?? ''];
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              />
              <ReferenceLine
                y={0}
                stroke="var(--app-border-strong)"
                strokeDasharray="3 3"
              />
              <Bar
                isAnimationActive={!prefersReducedMotion}
                animationDuration={420}
                animationEasing="ease-out"
                dataKey="netFlowUSD"
                name="Excedente neto del mes"
                fill="var(--app-accent-strong)"
                radius={[2, 2, 0, 0]}
                barSize={16}
              />
              <Area
                isAnimationActive={!prefersReducedMotion}
                animationDuration={420}
                animationEasing="ease-out"
                type="monotone"
                dataKey="cumulativeUSD"
                name="Capital acumulado"
                stroke="var(--app-success)"
                fill="var(--app-success-soft)"
                strokeWidth={2}
                dot={{ r: 3.5, fill: 'var(--app-success)' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-muted text-center py-8">
          Aún no hay cierres registrados para graficar la evolución de capital.
        </p>
      )}
      <ChartDataTable
        caption="Evolución de excedente mensual y capital acumulado"
        columns={['Mes', 'Excedente mensual', 'Tasa de ahorro', 'Capital acumulado']}
        rows={evolutionSeries.map((item) => [
          formatMonthLabel(item.month),
          `${item.netCents >= 0 ? '+' : '−'}$ ${formatMoney(Math.abs(item.netCents))}`,
          `${item.retentionPct.toFixed(1)}%`,
          `${item.cumulativeCents >= 0 ? '' : '−'}$ ${formatMoney(Math.abs(item.cumulativeCents))}`,
        ])}
      />
    </section>
  );
};

export default NetWorthChart;

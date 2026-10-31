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
import { AlertCircle } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import type { CashFlowForecastResponse } from '../../types';
import { formatMoney } from '../../utils/money';
import SkeletonChart from './SkeletonChart';

interface CashFlowForecastChartProps {
  cashFlowForecast: CashFlowForecastResponse | undefined;
  forecastDays: number;
  setForecastDays: (days: number) => void;
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

const formatForecastDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(year, month - 1, day));
};

const formatForecastTableDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
};

const CashFlowForecastChart = ({
  cashFlowForecast,
  forecastDays,
  setForecastDays,
}: CashFlowForecastChartProps) => {
  const prefersReducedMotion = useReducedMotion();

  if (!cashFlowForecast) {
    return <SkeletonChart height="h-64" />;
  }

  const forecast = cashFlowForecast.forecast ?? [];
  const startBalance =
    forecast.length > 0
      ? forecast[0].projected_balance
      : cashFlowForecast.current_balance;
  const endBalance = forecast.at(-1)?.projected_balance ?? cashFlowForecast.current_balance;
  const netDelta = endBalance - startBalance;
  const deltaTone = new Map([[1, 'text-success'], [-1, 'text-danger']]).get(Math.sign(netDelta)) ?? '';
  const deltaSign = new Map([[1, '+'], [-1, '−']]).get(Math.sign(netDelta)) ?? '';
  const lowestFutureBalance = forecast
    .slice(1)
    .reduce<(typeof forecast)[number] | undefined>(
      (lowest, point) =>
        !lowest || point.projected_balance < lowest.projected_balance
          ? point
          : lowest,
      undefined,
    );
  const lowestIsNegative = (lowestFutureBalance?.projected_balance ?? 0) < 0;

  return (
    <section
      className="app-chart-panel cash-flow-forecast-panel"
      aria-label="Proyección de liquidez"
    >
      <div className="cash-flow-forecast-head">
        <div>
          <span className="cash-flow-kicker">
            Proyección de liquidez · {forecastDays} días
          </span>
          <div className="cash-flow-headline-row">
            <h2 className="cash-flow-title">
              {endBalance < 0 ? '−' : ''}$ {formatMoney(Math.abs(endBalance))}
            </h2>
            <span className="cash-flow-subtitle">
              saldo estimado al cierre del horizonte
            </span>
          </div>
        </div>
        <div className="cash-flow-controls">
          {cashFlowForecast.has_negative_balance && (
            <span className="cash-flow-risk-pill">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Riesgo de liquidez
            </span>
          )}
          <fieldset
            className="forecast-horizon-group"
            aria-label="Horizonte de proyección"
          >
            {[30, 60, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setForecastDays(days)}
                aria-pressed={forecastDays === days}
                className={`forecast-horizon-btn ${
                  forecastDays === days ? 'is-active' : ''
                }`}
              >
                {days}d
              </button>
            ))}
          </fieldset>
        </div>
      </div>

      {/* Operational Treasury Strip */}
      {forecast.length > 0 && (
        <div className="chart-kpi-strip" aria-label="Indicadores de proyección">
          <div className="chart-kpi-item">
            <span>Saldo actual</span>
            <strong>
              {startBalance < 0 ? '−' : ''}${' '}
              {formatMoney(Math.abs(startBalance))}
            </strong>
          </div>
          {lowestFutureBalance && (
            <div className="chart-kpi-item">
              <span>
                Punto mínimo ({formatForecastDate(lowestFutureBalance.date)})
              </span>
              <strong className={lowestIsNegative ? 'text-danger' : ''}>
                {lowestIsNegative ? '−' : ''}${' '}
                {formatMoney(Math.abs(lowestFutureBalance.projected_balance))}
              </strong>
            </div>
          )}
          <div className="chart-kpi-item">
            <span>Variación neta ({forecastDays}d)</span>
            <strong
              className={deltaTone}
            >
              {deltaSign}${' '}
              {formatMoney(Math.abs(netDelta))}
            </strong>
          </div>
        </div>
      )}

      {forecast.length > 0 ? (
        <div className="cash-flow-chart-wrap">
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart
              data={forecast}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--app-accent-strong)"
                    stopOpacity={0.18}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--app-accent-strong)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="2 5"
                stroke="var(--app-border)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                stroke="var(--app-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'var(--app-border)' }}
                tickFormatter={(value: string) => {
                  const parts = value.split('-');
                  return `${parts[2]}/${parts[1]}`;
                }}
              />
              <YAxis
                stroke="var(--app-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(value) => `$${(value / 100).toLocaleString()}`}
              />
              <Tooltip
                cursor={{
                  stroke: 'var(--app-border-strong)',
                  strokeDasharray: '3 3',
                }}
                contentStyle={{
                  backgroundColor: 'var(--app-surface)',
                  border: '1px solid var(--app-border-strong)',
                  borderRadius: '4px',
                  boxShadow: '0 8px 20px rgba(37, 34, 30, 0.12)',
                  fontSize: '12px',
                }}
                labelStyle={{
                  color: 'var(--app-muted)',
                  fontWeight: 600,
                  marginBottom: '4px',
                }}
                itemStyle={{ color: 'var(--app-text)', fontWeight: 600 }}
                labelFormatter={(label) => {
                  if (typeof label !== 'string') return '';
                  const [year, month, day] = label.split('-');
                  const monthIndex = Number.parseInt(month, 10) - 1;
                  const dayNum = Number.parseInt(day, 10);
                  return `${dayNum} de ${MONTH_NAMES[monthIndex]?.toLowerCase() ?? month} de ${year}`;
                }}
                formatter={(value) => [
                  `$ ${formatMoney(value as number)}`,
                  'Saldo proyectado',
                ]}
              />
              <ReferenceLine
                y={0}
                stroke="var(--app-danger)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <Area
                isAnimationActive={!prefersReducedMotion}
                animationDuration={420}
                animationEasing="ease-out"
                type="monotone"
                dataKey="projected_balance"
                name="Saldo proyectado"
                stroke="var(--app-accent-strong)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorBalance)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-muted text-center py-8">
          La proyección aparecerá cuando existan datos suficientes.
        </p>
      )}

      <ChartDataTable
        caption="Proyección de liquidez"
        columns={['Fecha', 'Saldo proyectado']}
        rows={forecast.map((item) => [
          formatForecastTableDate(item.date),
          `$ ${formatMoney(item.projected_balance)}`,
        ])}
      />
    </section>
  );
};

export default CashFlowForecastChart;

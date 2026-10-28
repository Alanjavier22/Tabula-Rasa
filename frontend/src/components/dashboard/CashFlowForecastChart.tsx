import ChartDataTable from './ChartDataTable';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AlertCircle } from 'lucide-react';
import type { CashFlowForecastResponse } from '../../types';
import { formatMoney } from '../../utils/money';
import SkeletonChart from './SkeletonChart';

interface CashFlowForecastChartProps {
  cashFlowForecast: CashFlowForecastResponse | undefined;
  forecastDays: number;
  setForecastDays: (days: number) => void;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const CashFlowForecastChart = ({ cashFlowForecast, forecastDays, setForecastDays }: CashFlowForecastChartProps) => {
  if (!cashFlowForecast) {
    return <SkeletonChart height="h-64" />;
  }

  return (
    <div className="bg-surface  rounded-2xl border border-line p-4 lg:p-6 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-lg font-semibold text-primary">Proyección de Liquidez</h3>
        <div className="flex items-center gap-2">
          {[30, 60, 90].map(days => (
            <button
              key={days}
              onClick={() => setForecastDays(days)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                forecastDays === days
                  ? 'bg-accent-strong text-on-color shadow-lg '
                  : 'bg-surface text-muted hover:bg-surface-strong hover:text-primary'
              }`}
            >
              {days}d
            </button>
          ))}
          {cashFlowForecast.has_negative_balance && (
            <div className="flex items-center gap-2 text-danger text-sm font-bold ml-2">
              <AlertCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Riesgo de Liquidez</span>
            </div>
          )}
        </div>
      </div>
      {cashFlowForecast.forecast && cashFlowForecast.forecast.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={cashFlowForecast.forecast}>
            <defs>
              <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--app-accent-strong)" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="var(--app-accent-strong)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" />
            <XAxis
              dataKey="date"
              stroke="var(--app-muted)"
              fontSize={12}
              tickFormatter={(value: string) => {
                const parts = value.split('-');
                const month = parts[1];
                const day = parts[2];
                return `${day}-${month}`;
              }}
            />
            <YAxis
              stroke="var(--app-muted)"
              fontSize={12}
              tickFormatter={(value) => `$${(value / 100).toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--app-surface)', border: '1px solid var(--app-border)', borderRadius: '8px' }}
              labelStyle={{ color: 'var(--app-text)' }}
              itemStyle={{ color: 'var(--app-text)' }}
              labelFormatter={(label) => {
                if (typeof label !== 'string') return '';
                const [year, month, day] = label.split('-');
                const monthIndex = Number.parseInt(month) - 1;
                const dayNum = Number.parseInt(day);
                return `${dayNum} de ${MONTH_NAMES[monthIndex].toLowerCase()} de ${year}`;
              }}
              formatter={(value) => [`$${formatMoney(value)}`, 'Balance Proyectado']}
            />
            <ReferenceLine y={0} stroke="var(--app-danger)" strokeWidth={2} strokeDasharray="5 5" />
            <Area isAnimationActive={false}
              type="monotone"
              dataKey="projected_balance"
              name="Balance Proyectado"
              stroke="var(--app-accent-strong)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorBalance)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-muted text-center py-8">La proyección aparecerá cuando existan datos suficientes.</p>
      )}
      <ChartDataTable caption="Proyección de liquidez" columns={['Fecha', 'Saldo proyectado']} rows={(cashFlowForecast.forecast ?? []).map(item => [item.date, `$ ${formatMoney(item.projected_balance)}`])} />
    </div>
  );
};

export default CashFlowForecastChart;

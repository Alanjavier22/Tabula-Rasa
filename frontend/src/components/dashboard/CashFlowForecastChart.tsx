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
    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-lg font-semibold text-white">Proyección de Liquidez</h3>
        <div className="flex items-center gap-2">
          {[30, 60, 90].map(days => (
            <button
              key={days}
              onClick={() => setForecastDays(days)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                forecastDays === days
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white'
              }`}
            >
              {days}d
            </button>
          ))}
          {cashFlowForecast.has_negative_balance && (
            <div className="flex items-center gap-2 text-red-400 text-sm font-bold ml-2">
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
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis
              dataKey="date"
              stroke="#94a3b8"
              fontSize={12}
              tickFormatter={(value: string) => {
                const parts = value.split('-');
                const month = parts[1];
                const day = parts[2];
                return `${day}-${month}`;
              }}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={12}
              tickFormatter={(value) => `$${(value / 100).toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
              labelStyle={{ color: '#f1f5f9' }}
              itemStyle={{ color: '#f1f5f9' }}
              labelFormatter={(label) => {
                if (typeof label !== 'string') return '';
                const [year, month, day] = label.split('-');
                const monthIndex = parseInt(month) - 1;
                const dayNum = parseInt(day);
                return `${dayNum} de ${MONTH_NAMES[monthIndex].toLowerCase()} de ${year}`;
              }}
              formatter={(value) => [`$${formatMoney(value)}`, 'Balance Proyectado']}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" />
            <Area
              type="monotone"
              dataKey="projected_balance"
              name="Balance Proyectado"
              stroke="#8b5cf6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorBalance)"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-slate-500 text-center py-8">Sin datos de proyección</p>
      )}
    </div>
  );
};

export default CashFlowForecastChart;

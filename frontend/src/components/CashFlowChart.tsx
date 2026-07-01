/**
 * Cash Flow Chart - Projected Balance Visualization
 * Shows historical balance from snapshots and projected future balance
 */

import React, { useEffect, useState } from 'react';
import { db } from '../db/db';
import { cashFlowService } from '../services/CashFlowService';
import { formatMoney, toDecimal } from '../utils/money';

interface ChartDataPoint {
  date: string;
  historical?: number;
  projected?: number;
}

export const CashFlowChart: React.FC = () => {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState<unknown>(null);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get historical data from snapshots (last 12 months)
      const snapshots = await db.net_worth_snapshots
        .orderBy('date')
        .reverse()
        .limit(12)
        .toArray();

      const historicalData: ChartDataPoint[] = snapshots
        .reverse()
        .map(s => ({
          date: s.date,
          historical: s.net_worth_cents
        }));

      // Get forecast data
      const forecastData = await cashFlowService.getCashFlowForecast();
      setForecast(forecastData);

      // Add projection points
      const lastSnapshot = snapshots[0];
      if (lastSnapshot) {
        const now = new Date();
        const projectionPoints: ChartDataPoint[] = [
          {
            date: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            projected: forecastData.day30.projected_balance
          },
          {
            date: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            projected: forecastData.day60.projected_balance
          },
          {
            date: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            projected: forecastData.day90.projected_balance
          }
        ];

        setData([...historicalData, ...projectionPoints]);
      } else {
        setData(historicalData);
      }
    } catch (error) {
      console.error('Error loading cash flow data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
        <div className="text-slate-400 text-center">Cargando proyección...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
        <div className="text-slate-400 text-center">No hay datos disponibles</div>
      </div>
    );
  }

  // Simple SVG chart (fallback if no charting library)
  const allValues = data.map(d => d.historical || d.projected || 0);
  const maxValue = Math.max(...allValues, 0);
  const minValue = Math.min(...allValues, 0);
  const range = maxValue - minValue || 1;

  const chartWidth = Math.max(600, data.length * 50);
  const chartHeight = 300;
  const padding = 40;

  const getX = (index: number) => padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
  const getY = (value: number) => padding + chartHeight - padding - ((value - minValue) / range) * (chartHeight - 2 * padding);

  return (
    <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
      <h3 className="text-white font-semibold mb-4">Proyección de Flujo de Caja (90 días)</h3>

      {/* Forecast Summary */}
      {forecast && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-700/50 p-3 rounded-lg">
            <div className="text-slate-400 text-xs mb-1">30 días</div>
            <div className="text-white font-bold">
              ${formatMoney(forecast.day30.projected_balance)}
            </div>
            <div className="text-xs text-emerald-400">
              {toDecimal(forecast.day30.projected_balance).gt(forecast.day30.current_balance) ? '+' : ''}
              {formatMoney(toDecimal(forecast.day30.projected_balance).minus(forecast.day30.current_balance))}
            </div>
          </div>
          <div className="bg-slate-700/50 p-3 rounded-lg">
            <div className="text-slate-400 text-xs mb-1">60 días</div>
            <div className="text-white font-bold">
              ${formatMoney(forecast.day60.projected_balance)}
            </div>
            <div className="text-xs text-emerald-400">
              {toDecimal(forecast.day60.projected_balance).gt(forecast.day60.current_balance) ? '+' : ''}
              {formatMoney(toDecimal(forecast.day60.projected_balance).minus(forecast.day60.current_balance))}
            </div>
          </div>
          <div className="bg-slate-700/50 p-3 rounded-lg">
            <div className="text-slate-400 text-xs mb-1">90 días</div>
            <div className="text-white font-bold">
              ${formatMoney(forecast.day90.projected_balance)}
            </div>
            <div className="text-xs text-emerald-400">
              {toDecimal(forecast.day90.projected_balance).gt(forecast.day90.current_balance) ? '+' : ''}
              {formatMoney(toDecimal(forecast.day90.projected_balance).minus(forecast.day90.current_balance))}
            </div>
          </div>
        </div>
      )}

      {/* SVG Chart */}
      <div className="overflow-x-auto">
        <svg width={chartWidth} height={chartHeight + padding * 2}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = padding + chartHeight - padding - ratio * (chartHeight - 2 * padding);
            return (
              <line
                key={ratio}
                x1={padding}
                y1={y}
                x2={chartWidth - padding}
                y2={y}
                stroke="#334155"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            );
          })}

          {/* Historical line (solid) */}
          <path
            d={data.map((d, i) => {
              if (!d.historical) return '';
              const x = getX(i);
              const y = getY(d.historical);
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
          />

          {/* Projected line (dashed) */}
          <path
            d={data.map((d, i) => {
              const value = d.projected !== undefined ? d.projected : d.historical;
              if (value === undefined) return '';
              const x = getX(i);
              const y = getY(value);
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ')}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
          />

          {/* Data points */}
          {data.map((d, i) => {
            const value = d.projected !== undefined ? d.projected : d.historical;
            if (value === undefined) return null;
            const x = getX(i);
            const y = getY(value);
            const isProjected = d.projected !== undefined;

            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={4}
                fill={isProjected ? '#10b981' : '#3b82f6'}
              />
            );
          })}

          {/* Zero line */}
          {minValue < 0 && maxValue > 0 && (
            <line
              x1={padding}
              y1={getY(0)}
              x2={chartWidth - padding}
              y2={getY(0)}
              stroke="#ef4444"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full" />
          <span>Histórico</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-emerald-500 rounded-full" />
          <span>Proyectado</span>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-400">
        * Proyección basada en suscripciones, IOUs y ajuste estacional (Utilidades/Décimos)
      </div>
    </div>
  );
};
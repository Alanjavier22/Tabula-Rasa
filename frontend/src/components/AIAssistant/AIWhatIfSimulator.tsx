import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import type { WhatIfScenario } from '../../services/AIAgentService';

interface AIWhatIfSimulatorProps {
  scenario: WhatIfScenario | null;
  isLoading?: boolean;
}

export const AIWhatIfSimulator: React.FC<AIWhatIfSimulatorProps> = ({
  scenario,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-slate-900/50 rounded-2xl border border-white/5 backdrop-blur-md">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Generando proyección estratégica...</p>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="p-10 text-center bg-slate-900/50 rounded-2xl border border-white/5">
        <p className="text-slate-400">Sin datos de proyección disponibles</p>
      </div>
    );
  }

  // Premium Currency Formatter with abbreviations
  const formatYAxis = (value: number) => {
    const val = value / 100;
    if (Math.abs(val) >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(0)}k`;
    return `$${val.toFixed(0)}`;
  };

  const formatFullCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value / 100);
  };

  const allValues = scenario.projection.flatMap(p => [p.baseline_net_worth, p.projected_net_worth]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue;
  const padding = range * 0.15;

  // Analysis of the impact
  const initialImpact = (scenario.projection[0]?.projected_net_worth - scenario.projection[0]?.baseline_net_worth) / 100;
  const isNegativeAtStart = scenario.projection[0]?.projected_net_worth < 0;
  const monthsToRecover = scenario.projection.findIndex(p => p.projected_net_worth >= scenario.projection[0].baseline_net_worth);
  
  const getVerdict = () => {
    if (isNegativeAtStart) return { label: 'RIESGOSO', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', desc: 'Este escenario te dejaría con saldo negativo temporalmente.' };
    if (Math.abs(initialImpact) > (maxValue / 100) * 0.3) return { label: 'CAUTELA', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', desc: 'El impacto inicial es significativo para tu patrimonio actual.' };
    return { label: 'VIABLE', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', desc: 'Tu flujo de caja absorbe este cambio sin comprometer tu estabilidad.' };
  };

  const verdict = getVerdict();

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full -mr-32 -mt-32" />
          <div className="relative z-10">
            <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-3">
              {scenario.scenario_title}
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
              {scenario.summary}
            </p>
          </div>
        </div>

        <div className={`${verdict.bg} ${verdict.border} border p-6 rounded-2xl flex flex-col justify-center items-center text-center backdrop-blur-sm`}>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Resultado de la simulación</p>
          <span className={`${verdict.color} text-3xl font-black mb-2 tracking-tighter`}>{verdict.label}</span>
          <p className="text-slate-400 text-xs leading-tight">{verdict.desc}</p>
          {monthsToRecover > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5 w-full">
              <p className="text-[10px] text-slate-500 uppercase font-bold">Tiempo de recuperación</p>
              <p className="text-white font-bold">{monthsToRecover} meses</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-950/40 p-6 rounded-2xl border border-white/5 backdrop-blur-sm relative min-h-[400px] w-full min-w-0">
        <div className="absolute top-6 left-6 z-20">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Evolución del Patrimonio (12 Meses)</p>
          <p className="text-[9px] text-slate-500 mt-1 italic">Muestra cuánto dinero tendrías en un año según esta decisión.</p>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={scenario.projection} margin={{ top: 40, right: 30, left: 10, bottom: 20 }}>
            <defs>
              <linearGradient id="colorBaseline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#64748b" stopOpacity={0.1}/>
                <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorProjected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
            
            <XAxis
              dataKey="month"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#ffffff10' }}
              tickLine={false}
              dy={10}
            />
            
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={[minValue - padding, maxValue + padding]}
              width={60}
            />
            
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl ring-1 ring-black/50">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Mes {label}</p>
                      <div className="space-y-2">
                        {payload.map((entry: any, index: number) => (
                          <div key={index} className="flex items-center justify-between gap-8">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                              <span className="text-sm text-slate-300">{entry.name}</span>
                            </div>
                            <span className="text-sm font-mono font-bold text-white">
                              {formatFullCurrency(entry.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            
            <Legend 
              verticalAlign="top" 
              align="right" 
              iconType="circle"
              content={({ payload }) => (
                <div className="flex justify-end gap-6 mb-8">
                  {payload?.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-tighter">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            />

            <ReferenceLine y={0} stroke="#ef444450" strokeWidth={1} strokeDasharray="5 5" />
            
            <Area
              type="monotone"
              dataKey="baseline_net_worth"
              stroke="#64748b"
              strokeWidth={2}
              strokeDasharray="4 4"
              fillOpacity={1}
              fill="url(#colorBaseline)"
              name="Tendencia Actual"
              animationDuration={1500}
            />
            
            <Area
              type="monotone"
              dataKey="projected_net_worth"
              stroke="#3b82f6"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorProjected)"
              name="Escenario Simulado"
              animationDuration={2000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

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
import { Sparkles } from 'lucide-react';
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
  const isNegativeAtStart = scenario.projection[0]?.projected_net_worth < 0;
  const monthsToRecover = scenario.projection.findIndex(p => p.projected_net_worth >= scenario.projection[0].baseline_net_worth);
  
  // Wealth delta at 12 months
  const finalDelta = (scenario.projection[11]?.projected_net_worth - scenario.projection[11]?.baseline_net_worth) / 100;

  const getVerdict = () => {
    if (scenario.impact_type === 'income') {
      return { 
        label: 'CRECIMIENTO', 
        color: 'text-blue-400', 
        bg: 'bg-blue-500/10', 
        border: 'border-blue-500/20', 
        desc: 'Este incremento potenciará tu capacidad de ahorro y libertad financiera.' 
      };
    }
    
    // Risk-based verdicts for expenses/savings/investments
    if (scenario.risk_score >= 8) {
      return { 
        label: 'CRÍTICO', 
        color: 'text-rose-400', 
        bg: 'bg-rose-500/10', 
        border: 'border-rose-500/20', 
        desc: 'Este escenario compromete seriamente tu estabilidad financiera actual.' 
      };
    }
    
    if (scenario.risk_score >= 5) {
      return { 
        label: 'PRECAUCIÓN', 
        color: 'text-amber-400', 
        bg: 'bg-amber-500/10', 
        border: 'border-amber-500/20', 
        desc: 'El impacto es manejable pero requiere vigilancia de tu flujo de caja.' 
      };
    }

    if (scenario.impact_type === 'saving' || scenario.impact_type === 'investment') {
      return { 
        label: 'ESTRATÉGICO', 
        color: 'text-emerald-400', 
        bg: 'bg-emerald-500/10', 
        border: 'border-emerald-500/20', 
        desc: 'Esta medida fortalece tu salud financiera y acelera tu crecimiento.' 
      };
    }

    if (isNegativeAtStart) return { label: 'RIESGOSO', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', desc: 'Este escenario te dejaría con saldo negativo temporalmente.' };
    
    return { label: 'VIABLE', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', desc: 'Tu flujo de caja absorbe este cambio sin comprometer tu estabilidad.' };
  };

  const verdict = getVerdict();

  const getRiskColor = (score: number) => {
    if (score <= 3) return 'bg-emerald-500';
    if (score <= 7) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  // Debug logs to trace the new v3.0 fields
  console.log('[WhatIf Debug] Impact Type:', scenario.impact_type);
  console.log('[WhatIf Debug] Risk Score:', scenario.risk_score);
  console.log('[WhatIf Debug] Opt Tip:', scenario.optimization_tip);

  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Top Section: Analysis & Verdict */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Main Analysis Card */}
        <div className="lg:col-span-8 bg-gradient-to-br from-slate-900 to-slate-950 p-8 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full -mr-32 -mt-32" />
          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Impacto {scenario.impact_type === 'saving' ? 'de Ahorro' : scenario.impact_type === 'investment' ? 'de Inversión' : scenario.impact_type === 'income' ? 'de Ingreso' : 'de Gasto'}
              </span>
              <div className="flex items-center gap-3 bg-black/20 px-4 py-1.5 rounded-xl border border-white/5">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Nivel de Riesgo</span>
                <div className="flex gap-1">
                  {[...Array(10)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-1.5 h-3 rounded-full transition-all duration-500 ${i < (scenario.risk_score || 0) ? getRiskColor(scenario.risk_score || 0) : 'bg-white/10'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-2xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 leading-tight">
                {scenario.scenario_title}
              </h3>
              <p className="text-slate-400 text-lg font-medium leading-relaxed whitespace-pre-wrap">
                {scenario.summary}
              </p>
            </div>

            {(scenario.optimization_tip || "").length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex items-center gap-6 relative overflow-hidden group/tip mt-4">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/5 to-amber-500/0 translate-x-[-100%] group-hover/tip:translate-x-[100%] transition-transform duration-1000"></div>
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/30 shadow-lg shadow-amber-500/10">
                  <Sparkles className="w-7 h-7 text-amber-500" />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-1.5">Estrategia de Optimización</p>
                  <p className="text-slate-200 text-base font-bold leading-snug">{scenario.optimization_tip}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Verdict Side Card */}
        <div className={`lg:col-span-4 ${verdict.bg} ${verdict.border} border p-10 rounded-[2.5rem] flex flex-col justify-center items-center text-center backdrop-blur-sm relative overflow-hidden shadow-2xl`}>
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Análisis de Viabilidad</p>
          <span className={`${verdict.color} text-5xl font-black mb-4 tracking-tighter drop-shadow-sm`}>{verdict.label}</span>
          <p className="text-slate-400 text-sm leading-relaxed font-semibold px-2 mb-8">{verdict.desc}</p>
          
          <div className="pt-8 border-t border-white/10 w-full space-y-6">
            {scenario.impact_type === 'saving' || scenario.impact_type === 'investment' ? (
              <div className="animate-in fade-in zoom-in duration-500">
                <p className="text-[10px] text-emerald-500/60 uppercase font-black tracking-widest mb-2">Plus Patrimonial (12m)</p>
                <p className="text-3xl font-black text-white tracking-tight">{formatFullCurrency(finalDelta * 100)}</p>
              </div>
            ) : monthsToRecover > 0 ? (
              <div className="animate-in fade-in zoom-in duration-500">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Tiempo de recuperación</p>
                <p className="text-3xl font-black text-white tracking-tight">{monthsToRecover} meses</p>
              </div>
            ) : (
              <div className="animate-in fade-in zoom-in duration-500">
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Impacto Neto</p>
                <p className="text-3xl font-black text-white tracking-tight">{formatFullCurrency(finalDelta * 100)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assumptions Section - FULL WIDTH BELOW */}
      {scenario.key_assumptions && scenario.key_assumptions.length > 0 && (
        <div className="bg-slate-900/50 border border-white/5 rounded-[2.5rem] p-10 relative overflow-hidden backdrop-blur-md shadow-inner">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-10">
            <div className="space-y-2 min-w-[280px]">
              <h4 className="text-xs font-black text-blue-400 uppercase tracking-[0.4em] flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                Suposiciones Críticas
              </h4>
              <p className="text-[11px] text-slate-500 font-semibold italic max-w-[240px] leading-snug">Lógica estratégica utilizada por el motor Oracle para esta proyección.</p>
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {scenario.key_assumptions.map((assumption, i) => (
                <div key={i} className="flex items-start gap-4 group cursor-default">
                  <span className="text-blue-500/20 text-3xl font-black group-hover:text-blue-500/50 transition-all duration-500 transform group-hover:scale-110">0{i+1}</span>
                  <p className="text-sm text-slate-300 font-bold leading-relaxed group-hover:text-white transition-colors italic pt-1">
                    {assumption}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-950/40 p-10 rounded-[2.5rem] border border-white/5 backdrop-blur-sm relative min-h-[450px] w-full min-w-0 mt-4">
        <div className="absolute top-10 left-10 z-20">
          <p className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">Evolución del Patrimonio (12 Meses)</p>
          <p className="text-[11px] text-slate-600 mt-2 font-medium italic">Análisis comparativo entre tu tendencia actual y el escenario simulado.</p>
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

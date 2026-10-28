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
import type { DefaultLegendContentProps, TooltipContentProps } from 'recharts';
import { Sparkles } from 'lucide-react';
import type { WhatIfScenario } from '../../services/AIAgentService';

const formatFullCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value / 100);
};

const WhatIfTooltipContent = ({ active, payload, label }: TooltipContentProps) => {
  if (active && payload?.length) {
    return (
      <div className="bg-canvas  border border-line p-4 rounded-xl shadow-2xl ring-1 ring-line">
        <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Mes {label}</p>
        <div className="space-y-2">
          {payload.map((entry) => (
            <div key={String(entry.name ?? entry.color ?? 'series')} className="flex items-center justify-between gap-8">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-sm text-muted">{entry.name}</span>
              </div>
              <span className="text-sm font-mono font-bold text-primary">
                {formatFullCurrency(typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

const WhatIfLegendContent = ({ payload }: DefaultLegendContentProps) => (
  <div className="flex justify-end gap-6 mb-8">
    {payload?.map((entry) => (
      <div key={String(entry.value ?? entry.color ?? 'legend')} className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
        <span className="text-xs font-semibold text-muted uppercase tracking-tight">
          {entry.value}
        </span>
      </div>
    ))}
  </div>
);

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
      <div className="flex flex-col items-center justify-center py-20 bg-canvas rounded-2xl border border-line ">
        <div className="w-12 h-12 border-4 border-line border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-muted font-medium animate-pulse">Generando proyección estratégica...</p>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="p-10 text-center bg-canvas rounded-2xl border border-line">
        <p className="text-muted">Sin datos de proyección disponibles</p>
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
        color: 'text-info',
        bg: 'bg-info-soft',
        border: 'border-line',
        desc: 'Este incremento potenciará tu capacidad de ahorro y libertad financiera.'
      };
    }

    // Risk-based verdicts for expenses/savings/investments
    if (scenario.risk_score >= 8) {
      return {
        label: 'CRÍTICO',
        color: 'text-danger',
        bg: 'bg-danger-soft',
        border: 'border-line',
        desc: 'Este escenario compromete seriamente tu estabilidad financiera actual.'
      };
    }

    if (scenario.risk_score >= 5) {
      return {
        label: 'PRECAUCIÓN',
        color: 'text-warning',
        bg: 'bg-warning-soft',
        border: 'border-line',
        desc: 'El impacto es manejable pero requiere vigilancia de tu flujo de caja.'
      };
    }

    if (scenario.impact_type === 'saving' || scenario.impact_type === 'investment') {
      return {
        label: 'ESTRATÉGICO',
        color: 'text-success',
        bg: 'bg-success-soft',
        border: 'border-line',
        desc: 'Esta medida fortalece tu salud financiera y acelera tu crecimiento.'
      };
    }

    if (isNegativeAtStart) return { label: 'RIESGOSO', color: 'text-danger', bg: 'bg-danger-soft', border: 'border-line', desc: 'Este escenario te dejaría con saldo negativo temporalmente.' };

    return { label: 'VIABLE', color: 'text-success', bg: 'bg-success-soft', border: 'border-line', desc: 'Tu flujo de caja absorbe este cambio sin comprometer tu estabilidad.' };
  };

  const verdict = getVerdict();

  const getRiskColor = (score: number) => {
    if (score <= 3) return 'bg-success';
    if (score <= 7) return 'bg-warning';
    return 'bg-danger';
  };

  let impactLabel = 'de Gasto';
  if (scenario.impact_type === 'saving') {
    impactLabel = 'de Ahorro';
  } else if (scenario.impact_type === 'investment') {
    impactLabel = 'de Inversión';
  } else if (scenario.impact_type === 'income') {
    impactLabel = 'de Ingreso';
  }

  let financialImpactLabel = 'Impacto Neto';
  let financialImpactClass = 'text-muted';
  let financialImpactValue = formatFullCurrency(finalDelta * 100);
  if (scenario.impact_type === 'saving' || scenario.impact_type === 'investment') {
    financialImpactLabel = 'Plus Patrimonial (12m)';
    financialImpactClass = 'text-success';
  } else if (monthsToRecover > 0) {
    financialImpactLabel = 'Tiempo de recuperación';
    financialImpactValue = `${monthsToRecover} meses`;
  }


  return (
    <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Top Section: Analysis & Verdict */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Main Analysis Card */}
        <div className="lg:col-span-8 bg-surface-soft   p-4 md:p-6 rounded-3xl border border-line shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-info-soft  rounded-full -mr-32 -mt-32" />
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 bg-surface-soft border border-line rounded-lg text-xs font-black text-muted uppercase tracking-widest">
                Impacto {impactLabel}
              </span>
              <div className="flex items-center gap-3 bg-surface-soft px-4 py-1.5 rounded-xl border border-line">
                <span className="text-xs font-black text-muted uppercase tracking-widest">Nivel de Riesgo</span>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }, (_, index) => {
                    const level = index + 1;
                    return (
                      <div
                        key={level}
                        className={`w-1.5 h-3 rounded-full transition-all duration-500 ${level <= (scenario.risk_score || 0) ? getRiskColor(scenario.risk_score || 0) : 'bg-surface-soft'}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl md:text-2xl font-black text-primary   leading-tight">
                {scenario.scenario_title}
              </h3>
              <p className="text-muted text-sm font-medium leading-relaxed whitespace-pre-wrap">
                {scenario.summary}
              </p>
            </div>

            {(scenario.optimization_tip || "").length > 0 && (
              <div className="bg-warning-soft border border-line rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group/tip mt-2">
                <div className="absolute inset-0 bg-surface-soft    translate-x-[-100%] group-hover/tip:translate-x-[100%] transition-transform duration-1000"></div>
                <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center shrink-0 border border-line shadow-lg ">
                  <Sparkles className="w-5 h-5 text-warning" />
                </div>
                <div className="relative z-10">
                  <p className="text-xs font-black text-warning uppercase tracking-wide mb-0.5">Estrategia de Optimización</p>
                  <p className="text-primary text-sm font-bold leading-tight">{scenario.optimization_tip}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Verdict Side Card */}
        <div className={`lg:col-span-4 ${verdict.bg} ${verdict.border} border p-6 rounded-3xl flex flex-col justify-center items-center text-center  relative overflow-hidden shadow-2xl`}>
          <div className="absolute top-0 inset-x-0 h-1 bg-surface-soft   "></div>
          <p className="text-xs font-black text-muted uppercase tracking-wide mb-2">Análisis de Viabilidad</p>
          <span className={`${verdict.color} text-3xl font-black mb-2 tracking-tight drop-shadow-sm`}>{verdict.label}</span>
          <p className="text-muted text-xs leading-snug font-semibold px-2 mb-4">{verdict.desc}</p>

          <div className="pt-4 border-t border-line w-full space-y-4">
            <div className="animate-in fade-in zoom-in duration-500">
              <p className={`text-xs ${financialImpactClass} uppercase font-black tracking-widest mb-1`}>{financialImpactLabel}</p>
              <p className="text-xl font-black text-primary tracking-tight">{financialImpactValue}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Assumptions Section - FULL WIDTH BELOW */}
      {scenario.key_assumptions && scenario.key_assumptions.length > 0 && (
        <div className="bg-surface border border-line rounded-3xl p-6 relative overflow-hidden  shadow-inner">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div className="space-y-1 min-w-[200px]">
              <h4 className="text-xs font-black text-info uppercase tracking-[0.3em] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-info animate-pulse " />
                Suposiciones
              </h4>
              <p className="text-xs text-muted font-semibold italic max-w-[200px] leading-tight">Lógica Oracle para esta proyección.</p>
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scenario.key_assumptions.map((assumption, i) => (
                <div key={assumption} className="flex items-start gap-4 group cursor-default">
                  <span className="text-info text-3xl font-black group-hover:text-info transition-all duration-500 transform group-hover:scale-110">0{i+1}</span>
                  <p className="text-sm text-muted font-bold leading-relaxed group-hover:text-primary transition-colors italic pt-1">
                    {assumption}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-canvas p-4 md:p-6 rounded-3xl border border-line  relative min-h-[300px] w-full min-w-0 mt-2">
        <div className="absolute top-10 left-10 z-20">
          <p className="text-xs font-black text-muted uppercase tracking-[0.3em]">Evolución del Patrimonio (12 Meses)</p>
          <p className="text-xs text-muted mt-2 font-medium italic">Análisis comparativo entre tu tendencia actual y el escenario simulado.</p>
        </div>
        <ResponsiveContainer width="100%" height={240}>
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

            <Tooltip content={WhatIfTooltipContent} />

            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              content={WhatIfLegendContent}
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

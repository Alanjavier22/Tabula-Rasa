import { Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import type { SafeToSpendResponse } from '../../types';
import { formatMoney } from '../../utils/money';

interface SafeToSpendCardProps {
  data: SafeToSpendResponse;
}

export default function SafeToSpendCard({ data }: SafeToSpendCardProps) {
  const safeToSpend = data?.safe_to_spend ?? 0;
  const monthlyIncome = data?.monthly_income ?? 0;
  const currentBalance = data?.current_balance ?? 0;

  return (
    <div className="relative group mb-3">
      {/* Background Radiant Glow */}
      <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 blur-3xl opacity-50 rounded-[2rem] pointer-events-none" />
      
      <div className="bg-white/[0.03] backdrop-blur-[40px] rounded-[1.5rem] border border-white/10 p-4 shadow-[0_32px_64px_rgba(0,0,0,0.4)] overflow-hidden relative">
        {/* Inner Glass Highlights */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-white/[0.01] pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
        
        <div className="relative z-10 flex flex-col gap-2.5">
          {/* Main Hero Section */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 shadow-inner">
                  <Zap className="w-3 h-3 text-indigo-300 fill-indigo-300/10" />
                </div>
                <span className="text-[11px] font-black text-white/50 uppercase tracking-[0.15em] font-mono">Presupuesto Proyectado</span>
              </div>
              <div className="relative flex items-center gap-3">
                <p className="text-3xl lg:text-4xl font-black text-white tracking-tighter drop-shadow-2xl flex items-baseline">
                  <span className="text-xl lg:text-2xl text-white mr-1.5 font-mono select-none">$</span>
                  {formatMoney(safeToSpend)}
                </p>
                <div className="relative flex items-center justify-center">
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="absolute w-6 h-6 rounded-full bg-emerald-500/20 blur-md" 
                  />
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.8)]" />
                </div>
              </div>
            </div>
          </div>
          
          {/* Detailed Metrics Grid - Pure Glass Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 p-3 rounded-xl hover:bg-white/[0.08] transition-all group/item shadow-lg">
              <span className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">Liquidez</span>
              <span className="text-base font-bold text-white group-hover/item:text-indigo-200 transition-colors tracking-tight flex items-center">
                <span className="text-sm text-white mr-1 font-mono">$</span>
                {formatMoney(currentBalance)}
              </span>
            </div>
            
            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 p-3 rounded-xl hover:bg-white/[0.08] transition-all group/item shadow-lg">
              <span className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">Ingresos Proyectados</span>
              <span className="text-base font-bold text-emerald-400 group-hover/item:text-emerald-300 transition-colors tracking-tight flex items-center">
                <span className="text-sm text-emerald-400 mr-1 font-mono">$</span>
                {formatMoney(monthlyIncome)}
              </span>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 p-3 rounded-xl hover:bg-white/[0.08] transition-all group/item shadow-lg">
              <span className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">Suscripciones</span>
              <span className="text-base font-bold text-amber-300 group-hover/item:text-amber-200 transition-colors tracking-tight flex items-center">
                <span className="text-sm text-amber-300 mr-1 font-mono">$</span>
                {(data?.breakdown?.subscriptions ?? 0) > 0 ? '-' : ''}{formatMoney(data?.breakdown?.subscriptions ?? 0)}
              </span>
            </div>

            <div className="bg-white/[0.04] backdrop-blur-md border border-white/10 p-3 rounded-xl hover:bg-white/[0.08] transition-all group/item shadow-lg">
              <span className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1 block">Deuda Neta</span>
              <span className={`text-base font-bold transition-colors tracking-tight flex items-center ${
                ((data?.breakdown?.credit_cards ?? 0) + (data?.breakdown?.ious ?? 0) - (data?.breakdown?.debt_shares ?? 0)) >= 0 
                  ? 'text-rose-400 group-hover/item:text-rose-300' 
                  : 'text-emerald-400 group-hover/item:text-emerald-300'
              }`}>
                <span className={`text-sm mr-1 font-mono ${
                  ((data?.breakdown?.credit_cards ?? 0) + (data?.breakdown?.ious ?? 0) - (data?.breakdown?.debt_shares ?? 0)) >= 0 
                    ? 'text-rose-400' 
                    : 'text-emerald-400'
                }`}>$</span>
                {(() => {
                  const debtValue = (data?.breakdown?.credit_cards ?? 0) + (data?.breakdown?.ious ?? 0) - (data?.breakdown?.debt_shares ?? 0);
                  if (debtValue > 0) return '-';
                  if (debtValue < 0) return '+';
                  return '';
                })()}
                {formatMoney(Math.abs((data?.breakdown?.credit_cards ?? 0) + (data?.breakdown?.ious ?? 0) - (data?.breakdown?.debt_shares ?? 0)))}
              </span>
            </div>
          </div>

          {/* Footer Insights - Clean Glass Separator */}
          {((data?.projected_taxes ?? 0) > 0 || (data?.anomaly_leaks ?? 0) > 0 || (data?.safe_to_spend_buffer ?? 0) > 0) && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-1 py-2 bg-white/[0.005] border-t border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-indigo-400/40" />
                <span className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Reserva SRI</span>
                <span className="text-[9px] font-bold text-indigo-300/50">-${formatMoney(data?.projected_taxes ?? 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-purple-400/40" />
                <span className="text-[10px] text-white/30 uppercase font-bold tracking-wider">Colchón Seguridad</span>
                <span className="text-[9px] font-bold text-purple-300/50">-${formatMoney((data?.anomaly_leaks ?? 0) + (data?.safe_to_spend_buffer ?? 0))}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { Wallet, CreditCard, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { formatMoney, toDecimal } from '../../utils/money';

type MoneyValue = string | number | null | undefined | { toFixed: (n: number) => string };

interface SummaryCardsProps {
  balance: MoneyValue;
  creditCardDebt: MoneyValue;
  income: MoneyValue;
  expenses: MoneyValue;
}

export default function SummaryCards({ balance, creditCardDebt, income, expenses }: SummaryCardsProps) {
  const safeBalance = balance ?? 0;
  const safeCreditCardDebt = creditCardDebt ?? 0;
  const safeIncome = income ?? 0;
  const safeExpenses = expenses ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      {/* Saldo Disponible - Compact Precision */}
      <div className="group relative bg-white/[0.03] backdrop-blur-[40px] rounded-2xl border border-white/10 p-4 transition-all duration-500 hover:bg-white/[0.06] hover:shadow-2xl hover:-translate-y-1 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/[0.03] via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col justify-between h-full space-y-1">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest font-mono leading-none">Liquidez Neta</span>
              <span className="text-xs font-bold text-blue-400 group-hover:text-blue-300 transition-colors">Saldo Disponible</span>
            </div>
            <div className="relative bg-white/5 p-2 rounded-xl border border-white/10 shadow-inner group-hover:scale-105 transition-transform">
              <Wallet className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <p className="text-3xl font-black text-white tracking-tighter leading-none drop-shadow-sm">
            <span className="text-xl text-blue-400 mr-1.5 font-mono">$</span>
            {formatMoney(safeBalance)}
          </p>
        </div>
      </div>

      {/* Deuda Global - Compact Precision */}
      <div className="group relative bg-white/[0.03] backdrop-blur-[40px] rounded-2xl border border-white/10 p-4 transition-all duration-500 hover:bg-white/[0.06] hover:shadow-2xl hover:-translate-y-1 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/[0.03] via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col justify-between h-full space-y-1">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest font-mono leading-none">Pasivos Globales</span>
              <span className="text-xs font-bold text-rose-400 group-hover:text-rose-300 transition-colors">Deuda Total</span>
            </div>
            <div className="relative bg-white/5 p-2 rounded-xl border border-white/10 shadow-inner group-hover:scale-105 transition-transform">
              <CreditCard className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <p className="text-3xl font-black text-rose-400 tracking-tighter leading-none drop-shadow-sm">
            <span className="text-xl text-rose-400 mr-1.5 font-mono">$</span>
            {formatMoney(toDecimal(safeCreditCardDebt).abs())}
          </p>
        </div>
      </div>

      {/* Ingresos - Compact Precision */}
      <div className="group relative bg-white/[0.03] backdrop-blur-[40px] rounded-2xl border border-white/10 p-4 transition-all duration-500 hover:bg-white/[0.06] hover:shadow-2xl hover:-translate-y-1 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/[0.03] via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col justify-between h-full space-y-1">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest font-mono leading-none">Flujo Mensual</span>
              <span className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">Ingresos Totales</span>
            </div>
            <div className="relative bg-white/5 p-2 rounded-xl border border-white/10 shadow-inner group-hover:scale-105 transition-transform">
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-400 tracking-tighter leading-none drop-shadow-sm">
            <span className="text-xl text-emerald-400 mr-1.5 font-mono">$</span>
            {formatMoney(safeIncome)}
          </p>
        </div>
      </div>

      {/* Gastos - Compact Precision */}
      <div className="group relative bg-white/[0.03] backdrop-blur-[40px] rounded-2xl border border-white/10 p-4 transition-all duration-500 hover:bg-white/[0.06] hover:shadow-2xl hover:-translate-y-1 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/[0.03] via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col justify-between h-full space-y-1">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest font-mono leading-none">Consumo Operativo</span>
              <span className="text-xs font-bold text-amber-400 group-hover:text-amber-300 transition-colors">Gastos Totales</span>
            </div>
            <div className="relative bg-white/5 p-2 rounded-xl border border-white/10 shadow-inner group-hover:scale-105 transition-transform">
              <ArrowDownLeft className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-400 tracking-tighter leading-none drop-shadow-sm">
            <span className="text-xl text-amber-400 mr-1.5 font-mono">$</span>
            {formatMoney(safeExpenses)}
          </p>
        </div>
      </div>
    </div>
  );
}

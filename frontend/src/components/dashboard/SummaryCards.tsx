import { DollarSign, TrendingDown, TrendingUp, AlertCircle } from 'lucide-react';
import { formatMoney, toDecimal } from '../../utils/money';

// Acepta cualquier valor monetario: string (Decimal del backend), number, Decimal, null/undefined
type MoneyValue = string | number | null | undefined | { toFixed: (n: number) => string };

interface SummaryCardsProps {
  balance: MoneyValue;
  creditCardDebt: MoneyValue;
  income: MoneyValue;
  expenses: MoneyValue;
}

export default function SummaryCards({ balance, creditCardDebt, income, expenses }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6">
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs lg:text-sm">Saldo Disponible</p>
            <p className="text-2xl lg:text-3xl font-bold text-white mt-1">
              ${formatMoney(balance)}
            </p>
          </div>
          <div className="bg-blue-500/20 p-3 rounded-2xl">
            <DollarSign className="w-6 h-6 text-blue-400" />
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs lg:text-sm">Deuda Total Tarjetas</p>
            <p className="text-2xl lg:text-3xl font-bold text-red-400 mt-1">
              ${formatMoney(toDecimal(creditCardDebt).abs())}
            </p>
          </div>
          <div className="bg-red-500/20 p-3 rounded-2xl">
            <TrendingDown className="w-6 h-6 text-red-400" />
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs lg:text-sm">Ingresos</p>
            <p className="text-2xl lg:text-3xl font-bold text-green-400 mt-1">
              ${formatMoney(income)}
            </p>
          </div>
          <div className="bg-green-500/20 p-3 rounded-2xl">
            <TrendingUp className="w-6 h-6 text-green-400" />
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 lg:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs lg:text-sm">Gastos</p>
            <p className="text-2xl lg:text-3xl font-bold text-orange-400 mt-1">
              ${formatMoney(expenses)}
            </p>
          </div>
          <div className="bg-orange-500/20 p-3 rounded-2xl">
            <AlertCircle className="w-6 h-6 text-orange-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

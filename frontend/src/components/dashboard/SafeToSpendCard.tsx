import { DollarSign } from 'lucide-react';
import type { SafeToSpendResponse } from '../../types';
import { formatMoney } from '../../utils/money';

interface SafeToSpendCardProps {
  data: SafeToSpendResponse;
}

export default function SafeToSpendCard({ data }: SafeToSpendCardProps) {
  return (
    <div className="bg-gradient-to-r from-purple-600/90 to-blue-600/90 backdrop-blur-xl rounded-2xl border border-purple-500/50 p-6 mb-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-purple-100 text-sm font-medium mb-1">💰 Presupuesto Disponible (Safe to Spend)</p>
          <p className="text-4xl lg:text-5xl font-bold text-white">
            ${formatMoney(data.safe_to_spend)}
          </p>
          <div className="flex gap-4 mt-3 text-xs text-purple-100">
            <span>Ingresos mes: ${formatMoney(data.monthly_income)}</span>
            <span>•</span>
            <span>Saldo actual: ${formatMoney(data.current_balance)}</span>
            <span>•</span>
            <span>Gastos proyectados: ${formatMoney(data.projected_fixed_expenses)}</span>
            <span>•</span>
            <span>Gastos reales: ${formatMoney(data.actual_expenses)}</span>
          </div>
        </div>
        <div className="bg-white/20 p-4 rounded-2xl">
          <DollarSign className="w-12 h-12 text-white" />
        </div>
      </div>
    </div>
  );
}

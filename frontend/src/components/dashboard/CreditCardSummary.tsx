import { CreditCard } from 'lucide-react';
import Decimal from 'decimal.js-light';
import type { Account, CreditCardStatement } from '../../types';
import { formatMoney, toDecimal, clampZero } from '../../utils/money';

interface CreditCardSummaryProps {
  statements: CreditCardStatement[];
  cards: Account[];
}

export default function CreditCardSummary({ statements, cards }: CreditCardSummaryProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
      {cards.map(card => {
        const stmt = statements.find(s => s.account_id === card.id);
        // Decimal-safe: backend puede enviar montos como strings
        const pending = stmt
          ? clampZero(toDecimal(stmt.user_share).minus(toDecimal(stmt.amount_paid)))
          : new Decimal(0);
        return (
          <div key={card.id} className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-purple-500/20 p-2 rounded-xl">
                <CreditCard className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">{card.name}</p>
                {card.bank_name && <p className="text-xs text-slate-500">{card.bank_name}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-slate-500 text-xs">Deuda total</p>
                <p className="text-red-400 font-semibold">${formatMoney(toDecimal(card.balance).abs())}</p>
              </div>
              {stmt && (
                <>
                  <div>
                    <p className="text-slate-500 text-xs">Corte actual</p>
                    <p className="text-white font-semibold">${formatMoney(stmt.statement_balance)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Pendiente tuyo</p>
                    <p className={`font-semibold ${pending.lte(0) ? 'text-green-400' : 'text-orange-400'}`}>
                      ${formatMoney(pending)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Estado</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      stmt.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                      stmt.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {stmt.status === 'paid' ? 'Pagado' : stmt.status === 'partial' ? 'Parcial' : 'Pendiente'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { CreditCard } from 'lucide-react';
import Decimal from 'decimal.js-light';
import type { Account, CreditCardStatement } from '../../types';
import { formatMoney, toDecimal, clampZero } from '../../utils/money';

interface CreditCardSummaryProps {
  readonly statements: CreditCardStatement[];
  readonly cards: Account[];
}

const getStatementStatusClass = (status: string) => {
  if (status === 'paid') return 'bg-success-soft text-success';
  if (status === 'partial') return 'bg-warning-soft text-warning';
  return 'bg-danger-soft text-danger';
};

const getStatementStatusLabel = (status: string) => {
  if (status === 'paid') return 'Pagado';
  if (status === 'partial') return 'Parcial';
  return 'Pendiente';
};

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
          <div key={card.id} className="bg-surface  rounded-2xl border border-line p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-accent-soft p-2 rounded-xl">
                <CreditCard className="w-5 h-5 text-accent-strong" />
              </div>
              <div>
                <p className="text-primary font-medium text-sm">{card.name}</p>
                {card.bank_name && <p className="text-xs text-muted">{card.bank_name}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted text-xs">Deuda total</p>
                <p className="text-danger font-semibold">${formatMoney(toDecimal(card.balance).abs())}</p>
              </div>
              {stmt && (
                <>
                  <div>
                    <p className="text-muted text-xs">Corte actual</p>
                    <p className="text-primary font-semibold">${formatMoney(stmt.statement_balance)}</p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Pendiente tuyo</p>
                    <p className={`font-semibold ${pending.lte(0) ? 'text-success' : 'text-warning'}`}>
                      ${formatMoney(pending)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted text-xs">Estado</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatementStatusClass(stmt.status)}`}>
                      {getStatementStatusLabel(stmt.status)}
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

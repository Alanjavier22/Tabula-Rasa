import { CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import Decimal from 'decimal.js-light';
import type { Account, CreditCardStatement } from '../../types';
import { formatMoney, toDecimal, clampZero } from '../../utils/money';

interface CreditCardSummaryProps {
  readonly statements: CreditCardStatement[];
  readonly cards: Account[];
}

const getStatementStatusClass = (status: string) => {
  if (status === 'paid') return 'is-good';
  if (status === 'partial') return 'is-warning';
  return 'is-danger';
};

const getStatementStatusLabel = (status: string) => {
  if (status === 'paid') return 'Pagado';
  if (status === 'partial') return 'Parcial';
  return 'Pendiente';
};

export default function CreditCardSummary({
  statements,
  cards,
}: CreditCardSummaryProps) {
  if (cards.length === 0) {
    return (
      <section className="app-surface p-5">
        <div className="app-section-heading">
          <h3 className="app-section-title">Tarjetas de crédito</h3>
          <Link to="/accounts" className="app-text-link">
            Gestionar cuentas
          </Link>
        </div>
        <p className="app-inline-message">
          No tienes tarjetas de crédito registradas todavía.
        </p>
      </section>
    );
  }

  return (
    <section className="app-surface p-5" aria-label="Resumen de tarjetas">
      <div className="app-section-heading mb-4">
        <div>
          <span className="dashboard-panel-kicker">Compromisos bancarios</span>
          <h3 className="app-section-title">Tarjetas de crédito</h3>
        </div>
        <Link to="/accounts" className="app-text-link">
          Ver en Cuentas
        </Link>
      </div>
      <div className="credit-summary-grid">
        {cards.map((card) => {
          const stmt = statements.find((s) => s.account_id === card.id);
          const pending = stmt
            ? clampZero(
                toDecimal(stmt.user_share).minus(toDecimal(stmt.amount_paid)),
              )
            : new Decimal(0);
          const paidPct = stmt
            ? Math.min(
                100,
                (Number.parseFloat(toDecimal(stmt.amount_paid).toString()) /
                  Math.max(
                    1,
                    Number.parseFloat(
                      toDecimal(stmt.statement_balance).toString(),
                    ),
                  )) *
                  100,
              )
            : 0;

          return (
            <article key={card.id} className="credit-summary-card">
              <div className="credit-summary-head">
                <div className="credit-summary-identity">
                  <div className="credit-summary-icon" aria-hidden="true">
                    <CreditCard className="w-4 h-4 text-accent-strong" />
                  </div>
                  <div>
                    <h4>{card.name}</h4>
                    <span>{card.bank_name || 'Tarjeta personal'}</span>
                  </div>
                </div>
                {stmt && (
                  <span
                    className={`sentinel-status-badge ${getStatementStatusClass(
                      stmt.status,
                    )}`}
                  >
                    {getStatementStatusLabel(stmt.status)}
                  </span>
                )}
              </div>

              <div className="credit-summary-stats">
                <div>
                  <span>Deuda total</span>
                  <strong className="text-danger">
                    $ {formatMoney(toDecimal(card.balance).abs())}
                  </strong>
                </div>
                {stmt ? (
                  <>
                    <div>
                      <span>Corte actual</span>
                      <strong>$ {formatMoney(stmt.statement_balance)}</strong>
                    </div>
                    <div>
                      <span>Tu pendiente</span>
                      <strong
                        className={
                          pending.lte(0) ? 'text-success' : 'text-warning'
                        }
                      >
                        $ {formatMoney(pending)}
                      </strong>
                    </div>
                  </>
                ) : (
                  <div>
                    <span>Estado de cuenta</span>
                    <strong className="text-muted">Sin registrar</strong>
                  </div>
                )}
              </div>

              {stmt && (
                <div
                  className="account-statement-mini-progress"
                  title={`Pagado: ${paidPct.toFixed(0)}%`}
                >
                  <div style={{ width: `${paidPct}%` }} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

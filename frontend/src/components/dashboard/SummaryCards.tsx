import { Wallet, CreditCard, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { formatMoney, toDecimal } from '../../utils/money';

type MoneyValue = string | number | null | undefined | { toFixed: (n: number) => string };

interface SummaryCardsProps {
  readonly balance: MoneyValue;
  readonly creditCardDebt: MoneyValue;
  readonly income: MoneyValue;
  readonly expenses: MoneyValue;
}

const summaryItems = [
  { key: 'balance', label: 'Liquidez', description: 'Saldo disponible', icon: Wallet, tone: 'info' },
  { key: 'income', label: 'Ingresos', description: 'Proyectados', icon: ArrowDownLeft, tone: 'success' },
  { key: 'expenses', label: 'Gastos', description: 'Este mes', icon: ArrowUpRight, tone: 'warning' },
  { key: 'debt', label: 'Deuda total', description: 'Tarjetas y compromisos', icon: CreditCard, tone: 'danger' },
] as const;

export default function SummaryCards({ balance, creditCardDebt, income, expenses }: SummaryCardsProps) {
  const values: Record<string, MoneyValue> = {
    balance: balance ?? 0,
    income: income ?? 0,
    expenses: expenses ?? 0,
    debt: toDecimal(creditCardDebt ?? 0).abs(),
  };

  return (
    <div className="app-summary-grid" aria-label="Indicadores financieros del periodo">
      {summaryItems.map((item) => {
        const Icon = item.icon;
        return (
          <article key={item.key} className={`app-summary-card app-summary-card-${item.tone}`}>
            <div className="app-summary-card-head">
              <div>
                <p>{item.label}</p>
                <span>{item.description}</span>
              </div>
              <div className="app-summary-icon"><Icon aria-hidden="true" /></div>
            </div>
            <strong>$ {formatMoney(values[item.key])}</strong>
          </article>
        );
      })}
    </div>
  );
}

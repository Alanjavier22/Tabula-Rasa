import { useState } from 'react';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';
import type { SafeToSpendResponse } from '../../types';
import { formatMoney } from '../../utils/money';

interface SafeToSpendCardProps {
  readonly data: SafeToSpendResponse;
}

export default function SafeToSpendCard({ data }: SafeToSpendCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const safeToSpend = data?.safe_to_spend ?? 0;
  const monthlyIncome = data?.monthly_income ?? 0;
  const currentBalance = data?.current_balance ?? 0;
  const subscriptions = data?.breakdown?.subscriptions ?? 0;
  const debtValue = (data?.breakdown?.credit_cards ?? 0) + (data?.breakdown?.ious ?? 0) - (data?.breakdown?.debt_shares ?? 0);
  const usagePercent = monthlyIncome > 0 ? Math.min(100, Math.max(0, ((monthlyIncome - safeToSpend) / monthlyIncome) * 100)) : 0;

  return (
    <section className="app-safe-spend" aria-labelledby="safe-spend-title">
      <div className="app-safe-spend-main">
        <div className="app-panel-label"><Zap aria-hidden="true" /> Disponible para gastar</div>
        <div className="app-safe-spend-value">
          <strong id="safe-spend-title">$ {formatMoney(safeToSpend)}</strong>
          <span><i aria-hidden="true" />En rango saludable</span>
        </div>
        <p>Estimación después de gastos fijos, suscripciones y pagos comprometidos de este mes.</p>
        <div className="app-safe-spend-footer">
          <div className="app-progress" aria-label={`${Math.round(usagePercent)} por ciento del presupuesto mensual utilizado`}>
            <div className="app-progress-head"><span>Uso del presupuesto</span><strong>{Math.round(usagePercent)}%</strong></div>
            <div className="app-progress-track"><div className="app-progress-fill" style={{ width: `${usagePercent}%` }} /></div>
          </div>
          <button type="button" className="app-btn" onClick={() => setShowBreakdown((current) => !current)} aria-expanded={showBreakdown}>
            {showBreakdown ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            {showBreakdown ? 'Ocultar desglose' : 'Ver desglose'}
          </button>
        </div>
        {showBreakdown && (
          <div className="app-safe-spend-breakdown" aria-live="polite">
            <span>Liquidez <strong>$ {formatMoney(currentBalance)}</strong></span>
            <span>Ingresos proyectados <strong>$ {formatMoney(monthlyIncome)}</strong></span>
            <span>Suscripciones <strong>$ {formatMoney(subscriptions)}</strong></span>
            <span>Deuda neta <strong className={debtValue > 0 ? 'app-danger-text' : 'app-success-text'}>{debtValue > 0 ? '−' : '+'} $ {formatMoney(Math.abs(debtValue))}</strong></span>
          </div>
        )}
      </div>
    </section>
  );
}

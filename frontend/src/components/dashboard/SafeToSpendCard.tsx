import { useId, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  Info,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { SafeToSpendResponse } from "../../types";
import { formatMoney, toDecimal } from "../../utils/money";

interface SafeToSpendCardProps {
  readonly data?: SafeToSpendResponse;
  readonly isLoading?: boolean;
  readonly hasError?: boolean;
  readonly isFetching?: boolean;
  readonly onRetry?: () => void;
}

function estimateState(hasAmount: boolean, available: ReturnType<typeof toDecimal>) {
  if (!hasAmount) return 'unknown';
  if (available.lt(0)) return 'danger';
  if (available.eq(0)) return 'warning';
  return 'success';
}

export default function SafeToSpendCard({
  data,
  isLoading,
  hasError,
  isFetching,
  onRetry,
}: SafeToSpendCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const titleId = useId();
  const breakdownId = useId();
  // Pydantic serializes Decimal amounts as strings. Reject missing or malformed
  // estimates instead of presenting a fabricated zero balance.
  const rawAmount: unknown = data?.safe_to_spend;
  const hasAmount =
    (typeof rawAmount === "number" ||
      (typeof rawAmount === "string" && rawAmount.trim() !== "")) &&
    Number.isFinite(Number(rawAmount));
  const available = toDecimal(hasAmount ? rawAmount : 0);
  const state = estimateState(hasAmount, available);
  const status = {
    unknown: "Estimación no disponible",
    danger: "Saldo proyectado negativo",
    warning: "Sin margen disponible",
    success: "Margen proyectado disponible",
  }[state];
  const StatusIcon = { danger: AlertTriangle, warning: AlertTriangle, success: CircleCheck, unknown: Info }[state];
  const retry = onRetry && (
    <button
      type="button"
      className="app-btn"
      onClick={onRetry}
      disabled={isFetching}
    >
      <RefreshCw aria-hidden="true" />
      {isFetching ? "Actualizando…" : "Reintentar"}
    </button>
  );


  function renderEstimate() {
    if (isLoading && !data) return (
          <output>
            Calculando tu disponible para los próximos 30 días…
          </output>
        );
    if (!hasAmount) return (
          <div className="app-estimate-error">
            <output>
              No se pudo obtener la estimación. Reintenta para consultar tu
              disponible.
            </output>
            {retry}
          </div>
        );
    return (
          <>
            <div className="app-safe-spend-value">
              <strong>
                {available.lt(0) ? "−" : ""}$ {formatMoney(available.abs())}
              </strong>
            </div>
            <p>
              Proyección a 30 días después de pagos previstos, impuestos,
              ajustes y tu reserva de seguridad.
            </p>
            <div className="app-safe-spend-footer">
              <p className="app-safe-spend-context">
                {available.lte(0)
                  ? "Revisa los compromisos del desglose antes de planificar nuevos gastos."
                  : "Incluye ingresos y cobros previstos; el saldo de tus cuentas puede ser diferente."}
              </p>
              <button
                type="button"
                className={`app-disclosure-chip ${
                  showBreakdown ? "is-open" : ""
                }`}
                onClick={() => setShowBreakdown((current) => !current)}
                aria-expanded={showBreakdown}
                aria-controls={breakdownId}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {showBreakdown ? "Ocultar desglose" : "Ver desglose"}
                </span>
                <span className="app-disclosure-chevron" aria-hidden="true">
                  <ChevronDown className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
            {hasError && (
              <div className="app-estimate-error">
                <output>
                  No se pudo actualizar. Estás viendo la última estimación
                  disponible.
                </output>
                {retry}
              </div>
            )}
            <AnimatePresence initial={false}>
              {showBreakdown && data && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="app-disclosure-body"
                >
                  <div className="app-safe-spend-drawer">
                    <span className="app-safe-spend-drawer-kicker">
                      Composición del cálculo a 30 días
                    </span>
                    <dl id={breakdownId} className="app-safe-spend-breakdown">
                      <div className="is-positive">
                        <dt>Saldo líquido actual</dt>
                        <dd>$ {formatMoney(data.current_balance)}</dd>
                      </div>
                      <div className="is-positive">
                        <dt>Ingresos previstos</dt>
                        <dd>$ {formatMoney(data.monthly_income)}</dd>
                      </div>
                      <div>
                        <dt>Suscripciones</dt>
                        <dd>$ {formatMoney(data.breakdown?.subscriptions)}</dd>
                      </div>
                      <div>
                        <dt>Pagos de tarjetas</dt>
                        <dd>$ {formatMoney(data.breakdown?.credit_cards)}</dd>
                      </div>
                      <div>
                        <dt>Deudas personales netas</dt>
                        <dd>$ {formatMoney(data.breakdown?.ious)}</dd>
                      </div>
                      <div>
                        <dt>Cobros compartidos previstos</dt>
                        <dd>$ {formatMoney(data.breakdown?.debt_shares)}</dd>
                      </div>
                      <div>
                        <dt>Ajuste estacional</dt>
                        <dd>$ {formatMoney(data.breakdown?.seasonal)}</dd>
                      </div>
                      <div>
                        <dt>Reserva de seguridad</dt>
                        <dd>$ {formatMoney(data.safe_to_spend_buffer)}</dd>
                      </div>
                      <div>
                        <dt>Impuestos previstos</dt>
                        <dd>$ {formatMoney(data.projected_taxes)}</dd>
                      </div>
                      <div>
                        <dt>Ajuste por gastos atípicos</dt>
                        <dd>$ {formatMoney(data.anomaly_leaks)}</dd>
                      </div>
                    </dl>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        );
  }

return (
    <section
      className={`app-safe-spend app-safe-spend-${state}`}
      aria-labelledby={titleId}
      aria-busy={isLoading || isFetching || false}
    >
      <div className="app-safe-spend-main">
        <div className="app-safe-spend-header">
          <h2 id={titleId} className="app-safe-spend-title">
            Disponible para gastar
          </h2>
          {hasAmount && (
            <span className="app-safe-spend-status">
              <StatusIcon aria-hidden="true" />
              {status}
            </span>
          )}
        </div>
        {renderEstimate()}
      </div>
    </section>
  );
}

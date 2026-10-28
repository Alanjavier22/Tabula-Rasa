import { useId, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Info,
  RefreshCw,
} from "lucide-react";
import type { SafeToSpendResponse } from "../../types";
import { formatMoney, toDecimal } from "../../utils/money";

interface SafeToSpendCardProps {
  readonly data?: SafeToSpendResponse;
  readonly isLoading?: boolean;
  readonly hasError?: boolean;
  readonly isFetching?: boolean;
  readonly onRetry?: () => void;
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
  const state = !hasAmount
    ? "unknown"
    : available.lt(0)
      ? "danger"
      : available.eq(0)
        ? "warning"
        : "success";
  const status = {
    unknown: "Estimación no disponible",
    danger: "Saldo proyectado negativo",
    warning: "Sin margen disponible",
    success: "Margen proyectado disponible",
  }[state];
  const StatusIcon =
    state === "danger" || state === "warning"
      ? AlertTriangle
      : state === "success"
        ? CircleCheck
        : Info;
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

  return (
    <section
      className={`app-safe-spend app-safe-spend-${state}`}
      aria-labelledby={titleId}
      aria-busy={isLoading || isFetching || false}
    >
      <div className="app-safe-spend-main">
        <h2 id={titleId} className="app-safe-spend-title">
          Disponible para gastar
        </h2>
        {isLoading && !data ? (
          <p role="status">
            Calculando tu disponible para los próximos 30 días…
          </p>
        ) : !hasAmount ? (
          <div className="app-estimate-error">
            <p role="status">
              No se pudo obtener la estimación. Reintenta para consultar tu
              disponible.
            </p>
            {retry}
          </div>
        ) : (
          <>
            <div className="app-safe-spend-value">
              <strong>
                {available.lt(0) ? "−" : ""}$ {formatMoney(available.abs())}
              </strong>
              <span className="app-safe-spend-status">
                <StatusIcon aria-hidden="true" />
                {status}
              </span>
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
                className="app-btn"
                onClick={() => setShowBreakdown((current) => !current)}
                aria-expanded={showBreakdown}
                aria-controls={breakdownId}
              >
                {showBreakdown ? (
                  <ChevronUp aria-hidden="true" />
                ) : (
                  <ChevronDown aria-hidden="true" />
                )}
                {showBreakdown ? "Ocultar desglose" : "Ver desglose"}
              </button>
            </div>
            {hasError && (
              <div className="app-estimate-error">
                <p role="status">
                  No se pudo actualizar. Estás viendo la última estimación
                  disponible.
                </p>
                {retry}
              </div>
            )}
            {showBreakdown && data && (
              <dl id={breakdownId} className="app-safe-spend-breakdown">
                <div>
                  <dt>Saldo líquido actual</dt>
                  <dd>$ {formatMoney(data.current_balance)}</dd>
                </div>
                <div>
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
            )}
          </>
        )}
      </div>
    </section>
  );
}

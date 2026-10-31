import type Decimal from 'decimal.js-light';
import type { VehicleTelemetryResponse } from '../../types';
import { formatMoney } from '../../utils/money';
import { Car, Scale, CreditCard, Users } from 'lucide-react';

interface DashboardMetricsRowProps {
  netBalance: Decimal;
  totalStatementDue: Decimal;
  totalThirdPartyDebt: Decimal;
  vehicleCost: Decimal;
  vehicleTelemetry: VehicleTelemetryResponse | undefined;
}

const getMaintenanceClass = (estimate: number) => {
  if (estimate < 500) return 'is-danger';
  if (estimate < 1000) return 'is-warning';
  return 'is-good';
};

const DashboardMetricsRow = ({
  netBalance,
  totalStatementDue,
  totalThirdPartyDebt,
  vehicleCost,
  vehicleTelemetry,
}: DashboardMetricsRowProps) => {
  return (
    <section
      className="app-summary-grid dashboard-metrics-row"
      aria-label="Métricas operativas complementarias"
    >
      <article className="app-summary-card">
        <div className="app-summary-card-head">
          <div>
            <p>Resultado neto</p>
            <span>Ingresos menos gastos del mes</span>
          </div>
          <div className="app-summary-icon">
            <Scale aria-hidden="true" />
          </div>
        </div>
        <strong className={netBalance.gte(0) ? 'text-success' : 'text-danger'}>
          {netBalance.lt(0) ? '−' : ''}$ {formatMoney(netBalance.abs())}
        </strong>
      </article>

      <article className="app-summary-card">
        <div className="app-summary-card-head">
          <div>
            <p>Corte tarjetas (tuyo)</p>
            <span>Excluyendo consumos de terceros</span>
          </div>
          <div className="app-summary-icon">
            <CreditCard aria-hidden="true" />
          </div>
        </div>
        <strong className="text-warning">
          $ {formatMoney(totalStatementDue)}
        </strong>
      </article>

      <article className="app-summary-card">
        <div className="app-summary-card-head">
          <div>
            <p>Por cobrar a terceros</p>
            <span>Cuotas compartidas y préstamos</span>
          </div>
          <div className="app-summary-icon">
            <Users aria-hidden="true" />
          </div>
        </div>
        <strong className="text-info">
          $ {formatMoney(totalThirdPartyDebt)}
        </strong>
      </article>

      <article className="app-summary-card">
        <div className="app-summary-card-head">
          <div>
            <p>Gasto vehicular</p>
            <span>
              {vehicleTelemetry && vehicleTelemetry.total_distance > 0
                ? `$ ${formatMoney(vehicleTelemetry.cost_per_km)}/km · Hist: $ ${formatMoney(vehicleTelemetry.historical_cost_per_km)}/km`
                : 'Combustible y mantenimiento'}
            </span>
          </div>
          <div className="app-summary-icon">
            <Car aria-hidden="true" />
          </div>
        </div>
        <strong>$ {formatMoney(vehicleCost)}</strong>
        {vehicleTelemetry?.next_maintenance_estimate !== null &&
          vehicleTelemetry?.next_maintenance_estimate !== undefined && (
            <span
              className={`sentinel-status-badge mt-1 ${getMaintenanceClass(
                vehicleTelemetry.next_maintenance_estimate,
              )}`}
            >
              Mantenimiento en{' '}
              {Math.round(vehicleTelemetry.next_maintenance_estimate)} km
            </span>
          )}
      </article>
    </section>
  );
};

export default DashboardMetricsRow;

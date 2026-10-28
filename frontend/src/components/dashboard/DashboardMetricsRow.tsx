import type Decimal from 'decimal.js-light';
import type { VehicleTelemetryResponse } from '../../types';
import { formatMoney } from '../../utils/money';

interface DashboardMetricsRowProps {
  netBalance: Decimal;
  totalStatementDue: Decimal;
  totalThirdPartyDebt: Decimal;
  vehicleCost: Decimal;
  vehicleTelemetry: VehicleTelemetryResponse | undefined;
}

const getMaintenanceClass = (estimate: number) => {
  if (estimate < 500) return 'bg-danger-soft text-danger';
  if (estimate < 1000) return 'bg-warning-soft text-warning';
  return 'bg-success-soft text-success';
};

const DashboardMetricsRow = ({ netBalance, totalStatementDue, totalThirdPartyDebt, vehicleCost, vehicleTelemetry }: DashboardMetricsRowProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-surface  rounded-2xl border border-line p-4 text-center">
        <p className="text-muted text-xs mb-1">Balance Neto (Este mes)</p>
        <p className={`text-xl font-bold ${netBalance.gte(0) ? 'text-success' : 'text-danger'}`}>
          ${formatMoney(netBalance)}
        </p>
      </div>
      <div className="bg-surface  rounded-2xl border border-line p-4 text-center">
        <p className="text-muted text-xs mb-1">Saldos pendientes de tarjetas (tuyo)</p>
        <p className="text-xl font-bold text-warning">${formatMoney(totalStatementDue)}</p>
      </div>
      <div className="bg-surface  rounded-2xl border border-line p-4 text-center">
        <p className="text-muted text-xs mb-1">Te deben terceros</p>
        <p className="text-xl font-bold text-warning">${formatMoney(totalThirdPartyDebt)}</p>
      </div>
      <div className="bg-surface  rounded-2xl border border-line p-4 text-center">
        <p className="text-muted text-xs mb-1">🚗 Costo Vehículo</p>
        <p className="text-xl font-bold text-accent-strong">${formatMoney(vehicleCost)}</p>
        {vehicleTelemetry && (
          <div className="mt-2 space-y-1">
            {vehicleTelemetry.total_distance > 0 && (
              <p className="text-xs text-muted">
                ${formatMoney(vehicleTelemetry.cost_per_km)}/km | Hist: ${formatMoney(vehicleTelemetry.historical_cost_per_km)}/km
              </p>
            )}
            {vehicleTelemetry.total_distance <= 0 && vehicleTelemetry.total_vehicle_cost > 0 && (
              <p className="text-xs text-muted">Requiere +1 lectura de odómetro</p>
            )}

            {vehicleTelemetry.next_maintenance_estimate !== null && (
              <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${getMaintenanceClass(vehicleTelemetry.next_maintenance_estimate)}`}>
                Mantenimiento en: {Math.round(vehicleTelemetry.next_maintenance_estimate)} km
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardMetricsRow;

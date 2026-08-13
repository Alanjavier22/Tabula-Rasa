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

const DashboardMetricsRow = ({ netBalance, totalStatementDue, totalThirdPartyDebt, vehicleCost, vehicleTelemetry }: DashboardMetricsRowProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
        <p className="text-slate-400 text-xs mb-1">Balance Neto (Este mes)</p>
        <p className={`text-xl font-bold ${netBalance.gte(0) ? 'text-green-400' : 'text-red-400'}`}>
          ${formatMoney(netBalance)}
        </p>
      </div>
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
        <p className="text-slate-400 text-xs mb-1">Saldos pendientes de tarjetas (tuyo)</p>
        <p className="text-xl font-bold text-orange-400">${formatMoney(totalStatementDue)}</p>
      </div>
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 text-center">
        <p className="text-slate-400 text-xs mb-1">Te deben terceros</p>
        <p className="text-xl font-bold text-yellow-400">${formatMoney(totalThirdPartyDebt)}</p>
      </div>
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-purple-500/50 p-4 text-center">
        <p className="text-slate-400 text-xs mb-1">🚗 Costo Vehículo</p>
        <p className="text-xl font-bold text-purple-400">${formatMoney(vehicleCost)}</p>
        {vehicleTelemetry && (
          <div className="mt-2 space-y-1">
            {vehicleTelemetry.total_distance > 0 ? (
              <p className="text-[10px] text-slate-400">
                ${formatMoney(vehicleTelemetry.cost_per_km)}/km | Hist: ${formatMoney(vehicleTelemetry.historical_cost_per_km)}/km
              </p>
            ) : vehicleTelemetry.total_vehicle_cost > 0 ? (
              <p className="text-[10px] text-slate-500">Requiere +1 lectura de odómetro</p>
            ) : null}

            {vehicleTelemetry.next_maintenance_estimate !== null && (
              <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                vehicleTelemetry.next_maintenance_estimate < 500 ? 'bg-red-500/20 text-red-400' :
                vehicleTelemetry.next_maintenance_estimate < 1000 ? 'bg-amber-500/20 text-amber-400' :
                'bg-emerald-500/20 text-emerald-400'
              }`}>
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

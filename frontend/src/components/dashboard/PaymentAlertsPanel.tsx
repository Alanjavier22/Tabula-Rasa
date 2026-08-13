import { Bell, AlertCircle, CreditCard, Calendar } from 'lucide-react';
import type { AlertsResponse } from '../../types';
import { formatMoney } from '../../utils/money';

interface PaymentAlertsPanelProps {
  data: AlertsResponse;
}

const PaymentAlertsPanel = ({ data }: PaymentAlertsPanelProps) => {
  return (
    <div className="mb-6">
      <div className="bg-gradient-to-r from-amber-900/30 to-red-900/30 backdrop-blur-xl rounded-2xl border border-amber-500/40 p-4 lg:p-6">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-400" />
          Alertas de Pago
          <span className="ml-auto text-sm font-normal text-amber-400">
            Pendiente total: ${formatMoney(data.total_pending)}
          </span>
        </h3>
        <div className="space-y-2">
          {data.alerts.map((alert, idx) => (
            <div
              key={`${alert.account_id}-${alert.alert_type}-${idx}`}
              className={`flex items-center justify-between p-3 rounded-xl ${
                alert.severity === 'critical' ? 'bg-red-500/15 border border-red-500/30' :
                alert.severity === 'warning' ? 'bg-amber-500/15 border border-amber-500/30' :
                'bg-slate-700/30 border border-slate-600/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  alert.severity === 'critical' ? 'bg-red-500/20' :
                  alert.severity === 'warning' ? 'bg-amber-500/20' :
                  'bg-blue-500/20'
                }`}>
                  {alert.alert_type === 'overdue' ? (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  ) : alert.alert_type === 'payment_due' ? (
                    <CreditCard className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Calendar className="w-4 h-4 text-blue-400" />
                  )}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{alert.account_name}</p>
                  <p className="text-xs text-slate-400">
                    {alert.alert_type === 'overdue' && `Vencido hace ${Math.abs(alert.days_remaining)} días`}
                    {alert.alert_type === 'payment_due' && (
                      alert.days_remaining === 0 ? 'Vence hoy' :
                      alert.days_remaining === 1 ? 'Vence mañana' :
                      `Vence en ${alert.days_remaining} días`
                    )}
                    {alert.alert_type === 'statement_cut' && `Corte en ${alert.days_remaining} días`}
                    {alert.due_date && ` · ${alert.due_date}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold text-sm ${
                  alert.severity === 'critical' ? 'text-red-400' :
                  alert.severity === 'warning' ? 'text-amber-400' :
                  'text-slate-300'
                }`}>
                  ${formatMoney(alert.amount_pending)}
                </p>
                {alert.bank_name && (
                  <p className="text-xs text-slate-500">{alert.bank_name}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PaymentAlertsPanel;

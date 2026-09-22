import { Bell, AlertCircle, CreditCard, Calendar } from 'lucide-react';
import type { AlertsResponse } from '../../types';
import { formatMoney } from '../../utils/money';

interface PaymentAlertsPanelProps {
  data: AlertsResponse;
}

const getAlertContainerClass = (severity: string) => {
  if (severity === 'critical') return 'bg-red-500/15 border border-red-500/30';
  if (severity === 'warning') return 'bg-amber-500/15 border border-amber-500/30';
  return 'bg-slate-700/30 border border-slate-600/30';
};

const getAlertIconClass = (severity: string) => {
  if (severity === 'critical') return 'bg-red-500/20';
  if (severity === 'warning') return 'bg-amber-500/20';
  return 'bg-blue-500/20';
};

const getAlertTextClass = (severity: string) => {
  if (severity === 'critical') return 'text-red-400';
  if (severity === 'warning') return 'text-amber-400';
  return 'text-slate-300';
};

const getAlertIcon = (alertType: string) => {
  if (alertType === 'overdue') return <AlertCircle className="w-4 h-4 text-red-400" />;
  if (alertType === 'payment_due') return <CreditCard className="w-4 h-4 text-amber-400" />;
  return <Calendar className="w-4 h-4 text-blue-400" />;
};

const getPaymentDueMessage = (daysRemaining: number) => {
  if (daysRemaining === 0) return 'Vence hoy';
  if (daysRemaining === 1) return 'Vence mañana';
  return `Vence en ${daysRemaining} días`;
};

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
              className={`flex items-center justify-between p-3 rounded-xl ${getAlertContainerClass(alert.severity)}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${getAlertIconClass(alert.severity)}`}>
                  {getAlertIcon(alert.alert_type)}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{alert.account_name}</p>
                  <p className="text-xs text-slate-400">
                    {alert.alert_type === 'overdue' && `Vencido hace ${Math.abs(alert.days_remaining)} días`}
                    {alert.alert_type === 'payment_due' && getPaymentDueMessage(alert.days_remaining)}
                    {alert.alert_type === 'statement_cut' && `Corte en ${alert.days_remaining} días`}
                    {alert.due_date && ` · ${alert.due_date}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold text-sm ${getAlertTextClass(alert.severity)}`}>
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

import { Bell, AlertCircle, CreditCard, Calendar } from 'lucide-react';
import type { AlertsResponse } from '../../types';
import { formatMoney } from '../../utils/money';

interface PaymentAlertsPanelProps {
  data: AlertsResponse;
}

const getAlertContainerClass = (severity: string) => {
  if (severity === 'critical') return 'bg-danger-soft border border-line';
  if (severity === 'warning') return 'bg-warning-soft border border-line';
  return 'bg-surface border border-line';
};

const getAlertIconClass = (severity: string) => {
  if (severity === 'critical') return 'bg-danger-soft';
  if (severity === 'warning') return 'bg-warning-soft';
  return 'bg-info-soft';
};

const getAlertTextClass = (severity: string) => {
  if (severity === 'critical') return 'text-danger';
  if (severity === 'warning') return 'text-warning';
  return 'text-muted';
};

const getAlertIcon = (alertType: string) => {
  if (alertType === 'overdue') return <AlertCircle className="w-4 h-4 text-danger" />;
  if (alertType === 'payment_due') return <CreditCard className="w-4 h-4 text-warning" />;
  return <Calendar className="w-4 h-4 text-info" />;
};

const getPaymentDueMessage = (daysRemaining: number) => {
  if (daysRemaining === 0) return 'Vence hoy';
  if (daysRemaining === 1) return 'Vence mañana';
  return `Vence en ${daysRemaining} días`;
};

const PaymentAlertsPanel = ({ data }: PaymentAlertsPanelProps) => {
  return (
    <div className="mb-6">
      <div className="bg-surface-soft    rounded-2xl border border-line p-4 lg:p-6">
        <h3 className="text-lg font-semibold text-primary mb-3 flex items-center gap-2">
          <Bell className="w-5 h-5 text-warning" />
          Alertas de Pago
          <span className="ml-auto text-sm font-normal text-warning">
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
                  <p className="text-primary text-sm font-medium">{alert.account_name}</p>
                  <p className="text-xs text-muted">
                    {!alert.due_date || alert.due_date === 'Sin fecha' ? 'Vencimiento sin registrar' : <>
                      {alert.alert_type === 'overdue' && `Vencido hace ${Math.abs(alert.days_remaining)} días`}
                      {alert.alert_type === 'payment_due' && getPaymentDueMessage(alert.days_remaining)}
                      {alert.alert_type === 'statement_cut' && `Corte en ${alert.days_remaining} días`}
                      {` · ${alert.due_date}`}
                    </>}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-bold text-sm ${getAlertTextClass(alert.severity)}`}>
                  ${formatMoney(alert.amount_pending)}
                </p>
                {alert.bank_name && (
                  <p className="text-xs text-muted">{alert.bank_name}</p>
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

import { AlertCircle, CreditCard, Calendar } from 'lucide-react';
import type { AlertsResponse } from '../../types';
import { formatMoney } from '../../utils/money';

interface PaymentAlertsPanelProps {
  data: AlertsResponse;
}

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
    <div className="payment-reading">
      <div>
        <p className="payment-reading-total">Pendiente total <strong>$ {formatMoney(data.total_pending)}</strong></p>
        <div className="space-y-2">
          {data.alerts.map((alert, idx) => (
            <div
              key={`${alert.account_id}-${alert.alert_type}-${idx}`}
              className="payment-reading-row"
            >
              <div className="flex items-center gap-3">
                <div className="payment-reading-icon">
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
